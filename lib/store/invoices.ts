import type { ObjectId, WithId } from "mongodb";
import { ApiError } from "../api";
import { collections, invoiceToDTO, invoiceToSummary, toObjectId, type InvoiceDoc, type UserDoc } from "../db";
import { addDays, formatDate, todayAR } from "../format";
import { escapeHtml } from "../html";
import {
  canCancel,
  canDelete,
  canEdit,
  canIssue,
  canMarkPaid,
  canSend,
  canUnmarkPaid,
  computeTotals,
  formatInvoiceNumber,
  invoiceTitle,
  invoiceType,
} from "../invoice";
import { sendMail } from "../mail";
import { formatMoney } from "../money";
import { renderInvoicePdf } from "../pdf";
import { STORAGE_DOWN, getObject, invoicePdfKey, logoKey, putObject } from "../storage";
import type { DraftInput } from "../validation";
import type { ClientSnapshot, InvoiceDTO, InvoiceStatus, InvoiceSummaryDTO, IssuerCondition } from "../types";
import { getClientOr404 } from "./clients";
import { getUser, isProfileComplete } from "./profile";

// ---------------------------------------------------------------------------
// Facturas: borradores, emisión con número correlativo, cobro, anulación,
// PDF y envío por email. Toda consulta lleva el userId de la sesión.
// ---------------------------------------------------------------------------

/**
 * Un borrador todavía no tiene letra fija: depende de la condición del
 * emisor y del cliente, que pueden cambiar hasta emitirlo. Se calcula al
 * leerlo. Una factura emitida conserva lo que se guardó al emitirla.
 */
export function current(doc: WithId<InvoiceDoc>, issuer: IssuerCondition | null): WithId<InvoiceDoc> {
  if (doc.status !== "draft") return doc;
  const type = invoiceType(issuer, doc.client.ivaCondition);
  return { ...doc, type, totals: computeTotals(doc.lines, type) };
}

async function issuerCondition(userId: ObjectId): Promise<IssuerCondition | null> {
  return (await getUser(userId))?.profile.ivaCondition ?? null;
}

export async function getInvoiceDoc(userId: ObjectId, id: string): Promise<WithId<InvoiceDoc>> {
  const _id = toObjectId(id);
  const { invoices } = await collections();
  const doc = _id ? await invoices.findOne({ _id, userId }) : null;
  if (!doc) throw new ApiError(404, "No existe esa factura.");
  return doc;
}

export async function getInvoice(userId: ObjectId, id: string): Promise<InvoiceDTO> {
  const doc = await getInvoiceDoc(userId, id);
  return invoiceToDTO(current(doc, await issuerCondition(userId)));
}

export type InvoiceFilter = "all" | "draft" | "pending" | "overdue" | "paid" | "cancelled";

export async function listInvoices(userId: ObjectId, filter: InvoiceFilter = "all", today = todayAR()): Promise<InvoiceSummaryDTO[]> {
  const { invoices } = await collections();
  const query: Record<string, unknown> = { userId };
  if (filter === "draft") query.status = "draft";
  if (filter === "pending") query.status = "issued";
  if (filter === "overdue") Object.assign(query, { status: "issued", dueDate: { $lt: today } });
  if (filter === "paid") query.status = "paid";
  if (filter === "cancelled") query.status = "cancelled";
  const [docs, issuer] = await Promise.all([
    invoices.find(query).sort({ createdAt: -1 }).limit(500).toArray(),
    issuerCondition(userId),
  ]);
  return docs.map((doc) => invoiceToSummary(current(doc, issuer), today));
}

function snapshotOf(client: ClientSnapshot): ClientSnapshot {
  return {
    name: client.name,
    taxId: client.taxId,
    ivaCondition: client.ivaCondition,
    email: client.email,
    address: client.address,
  };
}

// --- Borradores --------------------------------------------------------------------

export async function createDraft(userId: ObjectId, input: DraftInput): Promise<InvoiceDTO> {
  const client = await getClientOr404(userId, input.clientId);
  const issuer = await issuerCondition(userId);
  const type = invoiceType(issuer, client.ivaCondition);
  const now = new Date();
  const doc: InvoiceDoc = {
    userId,
    clientId: client._id,
    status: "draft",
    type,
    pointOfSale: null,
    number: null,
    client: snapshotOf(client),
    issuer: null,
    issueDate: null,
    dueDate: input.dueDate,
    lines: input.lines,
    notes: input.notes,
    totals: computeTotals(input.lines, type),
    pdfKey: null,
    paidAt: null,
    cancelledAt: null,
    lastSentAt: null,
    lastSentTo: null,
    createdAt: now,
    updatedAt: now,
  };
  const { invoices } = await collections();
  const { insertedId } = await invoices.insertOne(doc);
  return invoiceToDTO({ _id: insertedId, ...doc });
}

export async function updateDraft(userId: ObjectId, id: string, input: DraftInput): Promise<InvoiceDTO> {
  const existing = await getInvoiceDoc(userId, id);
  if (!canEdit(existing.status)) throw new ApiError(409, "Una factura emitida no se puede modificar.");
  const client = await getClientOr404(userId, input.clientId);
  const issuer = await issuerCondition(userId);
  const type = invoiceType(issuer, client.ivaCondition);
  const { invoices } = await collections();
  const updated = await invoices.findOneAndUpdate(
    { _id: existing._id, userId, status: "draft" },
    {
      $set: {
        clientId: client._id,
        client: snapshotOf(client),
        type,
        dueDate: input.dueDate,
        lines: input.lines,
        notes: input.notes,
        totals: computeTotals(input.lines, type),
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  );
  if (!updated) throw new ApiError(409, "La factura se emitió mientras la editabas.");
  return invoiceToDTO(updated);
}

export async function deleteDraft(userId: ObjectId, id: string): Promise<void> {
  const existing = await getInvoiceDoc(userId, id);
  if (!canDelete(existing.status)) {
    throw new ApiError(409, "Una factura emitida no se borra: si hubo un error, anulala.");
  }
  const { invoices } = await collections();
  await invoices.deleteOne({ _id: existing._id, userId, status: "draft" });
}

/** Un borrador nuevo con los mismos datos (para repetir una factura). */
export async function duplicateInvoice(userId: ObjectId, id: string, today = todayAR()): Promise<InvoiceDTO> {
  const source = await getInvoiceDoc(userId, id);
  const user = await getUser(userId);
  const due = addDays(today, user?.preferences.defaultDueDays ?? 15);
  return createDraft(userId, {
    clientId: source.clientId.toString(),
    dueDate: due,
    lines: source.lines,
    notes: source.notes,
  });
}

// --- Emitir --------------------------------------------------------------------------

/**
 * Emite un borrador: le da letra, número correlativo y fecha, y copia los
 * datos del emisor y del cliente (desde ahí, fijos).
 *
 * El número sale de un contador por (usuario, punto de venta, letra) que
 * se incrementa de forma atómica ($inc): dos emisiones al mismo tiempo
 * nunca reciben el mismo número. Y antes de pedir el número, el borrador
 * se "reclama" pasándolo a emitida con una actualización condicional: un
 * doble clic en "Emitir" no gasta dos números.
 */
export async function issueInvoice(userId: ObjectId, id: string, today = todayAR()): Promise<InvoiceDTO> {
  const user = await getUser(userId);
  if (!user) throw new ApiError(401, "Tu cuenta ya no existe.");
  const profile = user.profile;
  if (!isProfileComplete(profile)) {
    throw new ApiError(409, "Antes de emitir, completá tus datos de emisor en Perfil (razón social, CUIT, condición de IVA y domicilio).");
  }
  const draft = await getInvoiceDoc(userId, id);
  if (!canIssue(draft.status)) throw new ApiError(409, "Esta factura ya está emitida.");
  const client = await getClientOr404(userId, draft.clientId.toString());
  if (draft.dueDate < today) throw new ApiError(400, "El vencimiento es anterior a hoy: cambialo antes de emitir.");

  const type = invoiceType(profile.ivaCondition, client.ivaCondition);
  const totals = computeTotals(draft.lines, type);
  if (totals.totalCents <= 0) throw new ApiError(400, "La factura no puede ser de $ 0.");

  const { invoices, counters } = await collections();
  const claimed = await invoices.findOneAndUpdate(
    // updatedAt: se emite exactamente lo que se validó, no una edición de otra pestaña.
    { _id: draft._id, userId, status: "draft", updatedAt: draft.updatedAt },
    {
      $set: {
        status: "issued",
        type,
        pointOfSale: profile.pointOfSale,
        issueDate: today,
        client: snapshotOf(client),
        issuer: {
          businessName: profile.businessName,
          cuit: profile.cuit,
          ivaCondition: profile.ivaCondition,
          address: profile.address,
          pointOfSale: profile.pointOfSale,
          activityStart: profile.activityStart,
        },
        totals,
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  );
  if (!claimed) throw new ApiError(409, "La factura cambió o ya se emitió. Recargá la página.");

  let issued: WithId<InvoiceDoc> | null = null;
  for (let attempt = 0; attempt < 3 && !issued; attempt++) {
    const counter = await counters.findOneAndUpdate(
      { userId, pointOfSale: profile.pointOfSale, type },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" },
    );
    try {
      issued = await invoices.findOneAndUpdate(
        { _id: claimed._id, userId },
        { $set: { number: counter!.seq } },
        { returnDocument: "after" },
      );
    } catch (error) {
      // Índice único: el número ya está usado (un contador tocado a mano). Siguiente.
      if (!(typeof error === "object" && error !== null && "code" in error && error.code === 11000)) throw error;
    }
  }
  if (!issued) throw new ApiError(500, "No se pudo numerar la factura. Probá de nuevo.");

  try {
    await storePdf(user, issued);
  } catch (error) {
    // Sin S3 la factura queda emitida igual: el PDF se genera al descargarlo.
    console.error("No se pudo guardar el PDF", error);
  }
  return invoiceToDTO(issued);
}

// --- Cobro y anulación ------------------------------------------------------------------

async function transition(
  userId: ObjectId,
  id: string,
  allowed: (status: InvoiceStatus) => boolean,
  from: InvoiceStatus,
  set: Partial<InvoiceDoc>,
  error: string,
): Promise<WithId<InvoiceDoc>> {
  const existing = await getInvoiceDoc(userId, id);
  if (!allowed(existing.status)) throw new ApiError(409, error);
  const { invoices } = await collections();
  const updated = await invoices.findOneAndUpdate(
    { _id: existing._id, userId, status: from },
    { $set: { ...set, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!updated) throw new ApiError(409, error);
  return updated;
}

export async function markPaid(userId: ObjectId, id: string, paid: boolean): Promise<InvoiceDTO> {
  const updated = paid
    ? await transition(userId, id, canMarkPaid, "issued", { status: "paid", paidAt: new Date() }, "Solo una factura emitida (sin anular) se marca como pagada.")
    : await transition(userId, id, canUnmarkPaid, "paid", { status: "issued", paidAt: null }, "Esta factura no está marcada como pagada.");
  return invoiceToDTO(updated);
}

/** Anular deja la factura (con su número) y le estampa "ANULADA" en el PDF. */
export async function cancelInvoice(userId: ObjectId, id: string): Promise<InvoiceDTO> {
  const updated = await transition(
    userId,
    id,
    canCancel,
    "issued",
    { status: "cancelled", cancelledAt: new Date() },
    "Solo se anula una factura emitida y sin pagar. Si está pagada, primero desmarcala.",
  );
  const user = await getUser(userId);
  try {
    if (user) await storePdf(user, updated);
  } catch (error) {
    console.error("No se pudo regenerar el PDF anulado", error);
    const { invoices } = await collections();
    await invoices.updateOne({ _id: updated._id }, { $set: { pdfKey: null } }); // se rehace al descargarlo
  }
  return invoiceToDTO(updated);
}

// --- PDF -------------------------------------------------------------------------

async function storePdf(user: WithId<UserDoc>, invoice: WithId<InvoiceDoc>): Promise<Uint8Array> {
  if (invoice.number === null || invoice.pointOfSale === null || !invoice.issuer || !invoice.issueDate) {
    throw new ApiError(409, "Un borrador no tiene PDF: primero emitilo.");
  }
  let logo = null;
  if (user.logo) {
    const bytes = await getObject(logoKey(user._id.toString()));
    if (bytes) logo = { bytes, contentType: user.logo.contentType };
  }
  const pdf = await renderInvoicePdf(
    {
      type: invoice.type,
      status: invoice.status,
      pointOfSale: invoice.pointOfSale,
      number: invoice.number,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      issuer: invoice.issuer,
      client: invoice.client,
      lines: invoice.lines,
      totals: invoice.totals,
      notes: invoice.notes,
    },
    logo,
  );
  const key = invoicePdfKey(user._id.toString(), invoice._id.toString());
  await putObject(key, pdf, "application/pdf");
  const { invoices } = await collections();
  await invoices.updateOne({ _id: invoice._id }, { $set: { pdfKey: key } });
  return pdf;
}

export function pdfFilename(invoice: Pick<InvoiceDoc, "type" | "pointOfSale" | "number">): string {
  return `Factura-${invoice.type}-${formatInvoiceNumber(invoice.pointOfSale, invoice.number)}.pdf`;
}

/** El PDF guardado en el bucket; si no está (S3 caído al emitir), se genera ahora. */
export async function invoicePdf(userId: ObjectId, id: string): Promise<{ bytes: Uint8Array; filename: string }> {
  const invoice = await getInvoiceDoc(userId, id);
  if (invoice.status === "draft") throw new ApiError(409, "Un borrador no tiene PDF: primero emitilo.");
  try {
    let bytes = invoice.pdfKey ? await getObject(invoice.pdfKey) : null;
    if (!bytes) {
      const user = await getUser(userId);
      if (!user) throw new ApiError(401, "Tu cuenta ya no existe.");
      bytes = await storePdf(user, invoice);
    }
    return { bytes, filename: pdfFilename(invoice) };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error("PDF", error);
    throw new ApiError(503, STORAGE_DOWN);
  }
}

// --- Envío por email -------------------------------------------------------------

/** Para no mandar dos veces por un doble clic. */
export const RESEND_WAIT_MS = 60 * 1000;

export async function sendInvoice(userId: ObjectId, id: string, to: string): Promise<InvoiceDTO> {
  const invoice = await getInvoiceDoc(userId, id);
  if (!canSend(invoice.status)) throw new ApiError(409, "Solo se manda una factura emitida (un borrador todavía no tiene número).");
  if (invoice.lastSentAt && Date.now() - invoice.lastSentAt.getTime() < RESEND_WAIT_MS) {
    throw new ApiError(429, "La acabás de mandar. Esperá un minuto para mandarla de nuevo.");
  }
  const { bytes, filename } = await invoicePdf(userId, id);
  const fresh = await getInvoiceDoc(userId, id);
  const issuer = fresh.issuer!;
  const title = invoiceTitle(fresh);
  const total = formatMoney(fresh.totals.totalCents);
  const due = formatDate(fresh.dueDate);
  const paid = fresh.status === "paid";
  try {
    await sendMail({
      to,
      fromName: issuer.businessName,
      subject: `${title} de ${issuer.businessName}`,
      html: [
        `<p>Hola, ${escapeHtml(fresh.client.name)}:</p>`,
        `<p>Te mandamos la <strong>${escapeHtml(title)}</strong> por <strong>${escapeHtml(total)}</strong>${paid ? ", que ya figura como pagada. ¡Gracias!" : `, con vencimiento el ${escapeHtml(due)}.`}</p>`,
        `<p>La factura va adjunta en PDF.</p>`,
        `<p>Saludos,<br>${escapeHtml(issuer.businessName)}</p>`,
        `<p style="color:#667085;font-size:12px">Comprobante de prueba generado con Talonario: no tiene validez fiscal.</p>`,
      ].join("\n"),
      text: `Hola, ${fresh.client.name}:\n\nTe mandamos la ${title} por ${total}${paid ? ", que ya figura como pagada." : `, con vencimiento el ${due}.`}\nLa factura va adjunta en PDF.\n\nSaludos,\n${issuer.businessName}`,
      attachments: [{ filename, content: Buffer.from(bytes), contentType: "application/pdf" }],
    });
  } catch (error) {
    console.error("No se pudo mandar la factura", error);
    throw new ApiError(502, "No se pudo mandar el mail. Revisá que el servidor de correo esté andando y probá de nuevo.");
  }
  const { invoices } = await collections();
  const updated = await invoices.findOneAndUpdate(
    { _id: fresh._id, userId },
    { $set: { lastSentAt: new Date(), lastSentTo: to } },
    { returnDocument: "after" },
  );
  return invoiceToDTO(updated ?? fresh);
}
