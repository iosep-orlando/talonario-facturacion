// Datos de ejemplo: un emisor (Tostadero La Esquina, responsable
// inscripto), seis clientes de todas las condiciones de IVA y facturas de
// los últimos meses en todos los estados.
//
//   npx tsx scripts/seed.ts
//
// Lee .env.local. El usuario es SEED_OWNER_EMAIL (si no está,
// demo@talonario.test): entrás con ese email. Se puede correr las veces que
// quieras: borra y vuelve a crear los datos de ESE usuario, nada más.
//
// Los PDF no se generan acá: se crean (y se guardan en RustFS) la primera
// vez que se abren. Así el seed no depende de que RustFS esté levantado.

import { existsSync } from "node:fs";
import type { ObjectId } from "mongodb";
import { closeDb, collections, type InvoiceDoc } from "../lib/db";
import { addDays, todayAR } from "../lib/format";
import { computeTotals, invoiceType } from "../lib/invoice";
import { newUserFields } from "../lib/store/profile";
import { validateEmail } from "../lib/validation";
import type { InvoiceLine, InvoiceStatus, IvaCondition } from "../lib/types";

// Las variables se leen al conectar, no al importar: alcanza con cargarlas acá.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

/** Un CUIT válido con ese comienzo (calcula el dígito verificador). */
function cuit(start: string): string {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  for (let n = Number(start.slice(2)); ; n++) {
    const base = `${start.slice(0, 2)}${String(n).padStart(8, "0")}`;
    const sum = weights.reduce((acc, w, i) => acc + w * Number(base[i]), 0);
    const check = 11 - (sum % 11);
    if (check === 10) continue;
    return `${base}${check === 11 ? 0 : check}`;
  }
}

async function main() {
  const email = validateEmail(process.env.SEED_OWNER_EMAIL || "demo@talonario.test");
  if (!email.ok) throw new Error("SEED_OWNER_EMAIL no es un email válido.");

  const { users, clients, invoices, counters } = await collections();
  const now = new Date();
  const today = todayAR(now);

  const user = await users.findOneAndUpdate(
    { email: email.value },
    { $setOnInsert: newUserFields(email.value, now) },
    { upsert: true, returnDocument: "after" },
  );
  const userId = user!._id;
  await users.updateOne(
    { _id: userId },
    {
      $set: {
        profile: {
          businessName: "Tostadero La Esquina",
          cuit: cuit("2032845710"),
          ivaCondition: "RI",
          address: "Av. Corrientes 4521, CABA",
          pointOfSale: 1,
          activityStart: "2019-03-01",
        },
        preferences: { defaultIvaRate: 2100, defaultDueDays: 15 },
      },
    },
  );

  // De cero, solo para este usuario.
  await Promise.all([
    clients.deleteMany({ userId }),
    invoices.deleteMany({ userId }),
    counters.deleteMany({ userId }),
  ]);

  const CLIENTS: { key: string; name: string; ivaCondition: IvaCondition; taxId: string; email: string; address: string }[] = [
    { key: "nandu", name: "Ñandú Café S.R.L.", ivaCondition: "RI", taxId: cuit("3071234560"), email: "compras@nanducafe.test", address: "Thames 1720, CABA" },
    { key: "almacen", name: "Almacén Don Tito", ivaCondition: "RI", taxId: cuit("2024567890"), email: "tito@almacen.test", address: "Calle 7 n.º 1234, La Plata" },
    { key: "lucia", name: "Lucía Fernández", ivaCondition: "MONOTRIBUTO", taxId: cuit("2734567890"), email: "lucia.fernandez@correo.test", address: "Belgrano 880, Rosario" },
    { key: "aromo", name: "Fundación El Aromo", ivaCondition: "EXENTO", taxId: cuit("3070987650"), email: "administracion@aromo.test", address: "San Martín 55, Córdoba" },
    { key: "martin", name: "Martín Gómez", ivaCondition: "CONSUMIDOR_FINAL", taxId: "30123456", email: "martin.gomez@correo.test", address: "Mitre 310, Quilmes" },
    { key: "sofia", name: "Sofía Ríos", ivaCondition: "CONSUMIDOR_FINAL", taxId: "", email: "", address: "" },
  ];

  const ids = new Map<string, { _id: ObjectId; data: (typeof CLIENTS)[number] }>();
  for (const c of CLIENTS) {
    const { key, ...data } = c;
    const { insertedId } = await clients.insertOne({ userId, ...data, createdAt: now, updatedAt: now });
    ids.set(key, { _id: insertedId, data: c });
  }

  const L = (description: string, quantity: number, pesos: number, ivaRate: InvoiceLine["ivaRate"] = 2100): InvoiceLine => ({
    description,
    quantity: quantity * 100,
    unitPriceCents: Math.round(pesos * 100),
    ivaRate,
  });

  // [cliente, días atrás de la emisión, días de plazo, estado, líneas]
  const PLAN: [string, number, number, InvoiceStatus, InvoiceLine[]][] = [
    ["nandu", 150, 30, "paid", [L("Café de especialidad tostado, 1 kg", 12, 18000), L("Molienda a pedido", 3, 2500)]],
    ["martin", 128, 0, "paid", [L("Café de especialidad tostado, 250 g", 2, 5200), L("Prensa francesa 600 ml", 1, 21500)]],
    ["lucia", 96, 15, "paid", [L("Curso de barismo inicial (2 clases)", 1, 45000)]],
    ["almacen", 72, 30, "paid", [L("Café de especialidad tostado, 1 kg", 8, 18000), L("Pan de masa madre", 20, 2800, 1050)]],
    ["aromo", 61, 15, "cancelled", [L("Libro «El café en la Argentina»", 10, 14000, 0)]],
    ["aromo", 60, 15, "paid", [L("Libro «El café en la Argentina»", 8, 14000, 0)]],
    ["nandu", 41, 15, "issued", [L("Café de especialidad tostado, 1 kg", 15, 18500), L("Filtros de papel x 100", 10, 1800)]],
    ["sofia", 22, 0, "paid", [L("Café de especialidad tostado, 250 g", 3, 5200)]],
    ["almacen", 9, 15, "issued", [L("Café de especialidad tostado, 1 kg", 6, 18500), L("Pan de masa madre", 24, 2800, 1050)]],
    ["nandu", 3, 15, "issued", [L("Café de especialidad tostado, 1 kg", 10, 18500), L("Molienda a pedido", 2, 2500)]],
    ["martin", 1, 0, "paid", [L("Molinillo manual de cerámica", 1, 38900)]],
  ];

  const profile = (await users.findOne({ _id: userId }))!.profile;
  const seq = new Map<string, number>();
  const docs: InvoiceDoc[] = [];
  for (const [key, ago, term, status, lines] of PLAN) {
    const client = ids.get(key)!;
    const type = invoiceType("RI", client.data.ivaCondition);
    const number = (seq.get(type) ?? 0) + 1;
    seq.set(type, number);
    const issueDate = addDays(today, -ago);
    const issuedAt = new Date(`${issueDate}T12:00:00-03:00`);
    const dueDate = addDays(issueDate, term);
    docs.push({
      userId,
      clientId: client._id,
      status,
      type,
      pointOfSale: 1,
      number,
      client: { name: client.data.name, taxId: client.data.taxId, ivaCondition: client.data.ivaCondition, email: client.data.email, address: client.data.address },
      issuer: { ...profile, ivaCondition: "RI" },
      issueDate,
      dueDate,
      lines,
      notes: type === "A" ? "Transferencia a CBU 0170000000000000000000 (Banco de ejemplo)." : "",
      totals: computeTotals(lines, type),
      pdfKey: null,
      paidAt: status === "paid" ? new Date(`${addDays(issueDate, Math.min(term, ago - 1, 10))}T15:00:00-03:00`) : null,
      cancelledAt: status === "cancelled" ? new Date(issuedAt.getTime() + 3600_000) : null,
      lastSentAt: null,
      lastSentTo: null,
      createdAt: issuedAt,
      updatedAt: issuedAt,
    });
  }

  // Un borrador, para emitirlo en la demo.
  const lucia = ids.get("lucia")!;
  const draftLines = [L("Café de especialidad tostado, 1 kg", 2, 18500), L("Filtros de papel x 100", 3, 1800)];
  docs.push({
    userId,
    clientId: lucia._id,
    status: "draft",
    type: "A",
    pointOfSale: null,
    number: null,
    client: { name: lucia.data.name, taxId: lucia.data.taxId, ivaCondition: lucia.data.ivaCondition, email: lucia.data.email, address: lucia.data.address },
    issuer: null,
    issueDate: null,
    dueDate: addDays(today, 15),
    lines: draftLines,
    notes: "",
    totals: computeTotals(draftLines, "A"),
    pdfKey: null,
    paidAt: null,
    cancelledAt: null,
    lastSentAt: null,
    lastSentTo: null,
    createdAt: now,
    updatedAt: now,
  });

  await invoices.insertMany(docs);
  for (const [type, last] of seq) {
    await counters.insertOne({ userId, pointOfSale: 1, type: type as InvoiceDoc["type"], seq: last });
  }

  console.log(`Clientes: ${CLIENTS.length}. Facturas: ${docs.length - 1} emitidas y 1 borrador.`);
  console.log(`Listo. Entrá en http://localhost:3000/login con ${email.value} y buscá el enlace en MailHog (http://localhost:8025).`);
  await closeDb();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await closeDb();
  process.exit(1);
});
