import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { IVA_RATE_LABEL, CONDITION_LABEL, effectiveRate, formatInvoiceNumber, ivaOf, lineNet, totalRows } from "./invoice";
import { formatDate } from "./format";
import { formatMoney, formatQuantity } from "./money";
import { formatCuit, formatTaxId } from "./validation";
import type { ClientSnapshot, InvoiceLine, InvoiceStatus, InvoiceTotals, InvoiceType, IssuerSnapshot } from "./types";

// ---------------------------------------------------------------------------
// El PDF de una factura, con el formato de las facturas argentinas: la
// letra en un recuadro arriba al centro (con su código de comprobante), el
// emisor a la izquierda, el número y las fechas a la derecha, el cliente
// debajo y las líneas en una tabla.
//
// Lo que cambia según la letra:
//   A  precios sin IVA, columna de alícuota y el IVA discriminado al pie;
//   B  precios con IVA incluido y, al pie, el "IVA contenido" que exige el
//      Régimen de Transparencia Fiscal al Consumidor (Ley 27.743);
//   C  sin IVA (lo emite un monotributista o un exento).
// ---------------------------------------------------------------------------

export interface PdfInvoice {
  type: InvoiceType;
  status: InvoiceStatus;
  pointOfSale: number;
  number: number;
  issueDate: string;
  dueDate: string;
  issuer: IssuerSnapshot;
  client: ClientSnapshot;
  lines: InvoiceLine[];
  totals: InvoiceTotals;
  notes: string;
}

export interface PdfLogo {
  bytes: Uint8Array;
  contentType: string;
}

/** Código de comprobante de ARCA: 01 = Factura A, 06 = B, 11 = C. */
export const TYPE_CODE: Record<InvoiceType, string> = { A: "01", B: "06", C: "11" };

const PAGE = { width: 595.28, height: 841.89 }; // A4
const MARGIN = 36;
const INK = rgb(0.11, 0.1, 0.18);
const MUTED = rgb(0.38, 0.38, 0.45);
const RULE = rgb(0.75, 0.75, 0.8);
const SHADE = rgb(0.94, 0.94, 0.96);
const STAMP = rgb(0.71, 0.22, 0.17);

/**
 * Las fuentes estándar del PDF solo tienen los caracteres de Windows-1252
 * (con tildes, ñ, ¿, ¡, €). Un emoji o un carácter chino en una
 * descripción haría fallar todo el PDF: se cambia por "?".
 */
export function pdfSafe(font: PDFFont, text: string): string {
  let out = "";
  for (const char of text.replace(/[\r\n\t]+/g, " ")) {
    try {
      font.encodeText(char);
      out += char;
    } catch {
      out += "?";
    }
  }
  return out;
}

/** Corta un texto en renglones que entren en `width`. */
export function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const words = pdfSafe(font, text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    // Una palabra más larga que el renglón se parte a la fuerza.
    let rest = word;
    while (font.widthOfTextAtSize(rest, size) > width) {
      let cut = rest.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    current = rest;
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

interface Column {
  title: string;
  width: number;
  align: "left" | "right";
  value: (line: InvoiceLine) => string;
}

/** Precio unitario con IVA (factura B). */
function unitGross(line: InvoiceLine, type: InvoiceType): number {
  return line.unitPriceCents + ivaOf(line.unitPriceCents, effectiveRate(type, line.ivaRate));
}

function columns(type: InvoiceType, tableWidth: number): Column[] {
  const qty: Column = { title: "Cant.", width: 52, align: "right", value: (l) => formatQuantity(l.quantity) };
  if (type === "A") {
    const fixed = 52 + 92 + 56 + 98;
    return [
      { title: "Descripción", width: tableWidth - fixed, align: "left", value: (l) => l.description },
      qty,
      { title: "Precio unit.", width: 92, align: "right", value: (l) => formatMoney(l.unitPriceCents) },
      { title: "IVA", width: 56, align: "right", value: (l) => IVA_RATE_LABEL[l.ivaRate] },
      { title: "Subtotal", width: 98, align: "right", value: (l) => formatMoney(lineNet(l)) },
    ];
  }
  const fixed = 52 + 104 + 104;
  return [
    { title: "Descripción", width: tableWidth - fixed, align: "left", value: (l) => l.description },
    qty,
    {
      title: type === "B" ? "Precio unit. c/IVA" : "Precio unit.",
      width: 104,
      align: "right",
      value: (l) => formatMoney(type === "B" ? unitGross(l, type) : l.unitPriceCents),
    },
    {
      title: type === "B" ? "Subtotal c/IVA" : "Subtotal",
      width: 104,
      align: "right",
      value: (l) => {
        const net = lineNet(l);
        return formatMoney(type === "B" ? net + ivaOf(net, effectiveRate(type, l.ivaRate)) : net);
      },
    },
  ];
}

export async function renderInvoicePdf(invoice: PdfInvoice, logo: PdfLogo | null = null): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const title = `Factura ${invoice.type} ${formatInvoiceNumber(invoice.pointOfSale, invoice.number)}`;
  doc.setTitle(title);
  doc.setAuthor(invoice.issuer.businessName);
  doc.setCreator("Talonario");
  doc.setProducer("Talonario (pdf-lib)");
  // Fecha fija de emisión: el mismo documento produce el mismo PDF.
  const created = new Date(`${invoice.issueDate}T12:00:00-03:00`);
  doc.setCreationDate(created);
  doc.setModificationDate(created);

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let image: PDFImage | null = null;
  if (logo) {
    try {
      image = logo.contentType === "image/png" ? await doc.embedPng(logo.bytes) : await doc.embedJpg(logo.bytes);
    } catch {
      image = null; // un logo dañado no impide la factura
    }
  }

  const right = PAGE.width - MARGIN;
  const contentWidth = right - MARGIN;
  const text = (page: PDFPage, value: string, x: number, y: number, size = 9, font = regular, color = INK) =>
    page.drawText(pdfSafe(font, value), { x, y, size, font, color });
  const textRight = (page: PDFPage, value: string, x: number, y: number, size = 9, font = regular, color = INK) => {
    const safe = pdfSafe(font, value);
    page.drawText(safe, { x: x - font.widthOfTextAtSize(safe, size), y, size, font, color });
  };
  const box = (page: PDFPage, x: number, y: number, w: number, h: number, fill?: typeof SHADE) =>
    page.drawRectangle({ x, y, width: w, height: h, borderColor: RULE, borderWidth: 0.8, color: fill });

  const pages: PDFPage[] = [];

  // --- Cabecera de la primera página ------------------------------------------
  function header(page: PDFPage): number {
    const top = PAGE.height - MARGIN;
    const height = 118;
    box(page, MARGIN, top - height, contentWidth, height);
    const mid = PAGE.width / 2;
    page.drawLine({ start: { x: mid, y: top - height }, end: { x: mid, y: top - 46 }, thickness: 0.8, color: RULE });

    // La letra, en su recuadro.
    box(page, mid - 22, top - 46, 44, 46, rgb(1, 1, 1));
    const letterWidth = bold.widthOfTextAtSize(invoice.type, 30);
    text(page, invoice.type, mid - letterWidth / 2, top - 30, 30, bold);
    const code = `COD. ${TYPE_CODE[invoice.type]}`;
    text(page, code, mid - regular.widthOfTextAtSize(code, 6.5) / 2, top - 41, 6.5, regular, MUTED);

    // Emisor.
    const issuer = invoice.issuer;
    let y = top - 16;
    if (image) {
      const scale = Math.min(150 / image.width, 40 / image.height, 1);
      const w = image.width * scale;
      const h = image.height * scale;
      page.drawImage(image, { x: MARGIN + 12, y: y - h + 6, width: w, height: h });
      y -= h + 8;
    }
    const leftWidth = mid - 22 - MARGIN - 24;
    for (const [i, row] of wrap(bold, issuer.businessName, 12, leftWidth).slice(0, 2).entries()) {
      text(page, row, MARGIN + 12, y - 4 - i * 14, 12, bold);
      if (i > 0) y -= 14;
    }
    y -= 22;
    for (const row of wrap(regular, issuer.address, 8.5, leftWidth).slice(0, 2)) {
      text(page, row, MARGIN + 12, y, 8.5, regular, MUTED);
      y -= 11;
    }
    text(page, CONDITION_LABEL[issuer.ivaCondition], MARGIN + 12, y, 8.5, bold);

    // Número y fechas.
    const rx = mid + 34;
    text(page, "FACTURA", rx, top - 24, 16, bold);
    const rows: [string, string][] = [
      ["Punto de venta", String(invoice.pointOfSale).padStart(4, "0")],
      ["Comp. Nro", String(invoice.number).padStart(8, "0")],
      ["Fecha de emisión", formatDate(invoice.issueDate)],
      ["CUIT", formatCuit(issuer.cuit)],
    ];
    if (issuer.activityStart) rows.push(["Inicio de actividades", formatDate(issuer.activityStart)]);
    rows.forEach(([label, value], i) => {
      const ry = top - 44 - i * 13;
      text(page, `${label}:`, rx, ry, 8.5, regular, MUTED);
      text(page, value, rx + 96, ry, 8.5, bold);
    });

    // Cliente.
    const clientTop = top - height - 8;
    const clientHeight = 58;
    box(page, MARGIN, clientTop - clientHeight, contentWidth, clientHeight);
    const client = invoice.client;
    const cx = MARGIN + 12;
    const half = mid + 6;
    text(page, "Cliente:", cx, clientTop - 16, 8.5, regular, MUTED);
    text(page, wrap(bold, client.name, 9.5, mid - cx - 60)[0], cx + 44, clientTop - 16, 9.5, bold);
    text(page, "Domicilio:", cx, clientTop - 31, 8.5, regular, MUTED);
    text(page, wrap(regular, client.address || "—", 8.5, mid - cx - 60)[0], cx + 44, clientTop - 31, 8.5);
    text(page, "Condición IVA:", half, clientTop - 16, 8.5, regular, MUTED);
    text(page, CONDITION_LABEL[client.ivaCondition], half + 68, clientTop - 16, 8.5, bold);
    text(page, "Documento:", half, clientTop - 31, 8.5, regular, MUTED);
    text(page, formatTaxId(client.taxId) || "—", half + 68, clientTop - 31, 8.5, bold);
    text(page, "Vencimiento:", half, clientTop - 46, 8.5, regular, MUTED);
    text(page, formatDate(invoice.dueDate), half + 68, clientTop - 46, 8.5, bold);
    text(page, "Condición de venta:", cx, clientTop - 46, 8.5, regular, MUTED);
    text(page, "Cuenta corriente", cx + 82, clientTop - 46, 8.5);

    return clientTop - clientHeight - 14;
  }

  function continuationHeader(page: PDFPage): number {
    const top = PAGE.height - MARGIN;
    text(page, `${title} (continuación)`, MARGIN, top - 12, 10, bold);
    text(page, invoice.issuer.businessName, MARGIN, top - 26, 8.5, regular, MUTED);
    return top - 44;
  }

  // --- Tabla de líneas --------------------------------------------------------------
  const cols = columns(invoice.type, contentWidth);
  const size = 8.5;
  const lineHeight = 11;
  const footerSpace = 56;

  function tableHead(page: PDFPage, y: number): number {
    page.drawRectangle({ x: MARGIN, y: y - 18, width: contentWidth, height: 18, color: SHADE });
    let x = MARGIN;
    for (const col of cols) {
      if (col.align === "left") text(page, col.title, x + 6, y - 12.5, 8, bold);
      else textRight(page, col.title, x + col.width - 6, y - 12.5, 8, bold);
      x += col.width;
    }
    return y - 18;
  }

  let page = doc.addPage([PAGE.width, PAGE.height]);
  pages.push(page);
  let y = tableHead(page, header(page));

  for (const line of invoice.lines) {
    const description = wrap(regular, line.description, size, cols[0].width - 12);
    const rowHeight = description.length * lineHeight + 8;
    if (y - rowHeight < MARGIN + footerSpace) {
      page = doc.addPage([PAGE.width, PAGE.height]);
      pages.push(page);
      y = tableHead(page, continuationHeader(page));
    }
    let x = MARGIN;
    for (const [i, col] of cols.entries()) {
      if (i === 0) description.forEach((row, r) => text(page, row, x + 6, y - 12 - r * lineHeight, size));
      else textRight(page, col.value(line), x + col.width - 6, y - 12, size);
      x += col.width;
    }
    y -= rowHeight;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: right, y }, thickness: 0.4, color: RULE });
  }

  // --- Pie: totales, IVA contenido y observaciones ---------------------------------------
  const rows = totalRows(invoice.type, invoice.totals);
  const notes = invoice.notes ? wrap(regular, invoice.notes, 8.5, contentWidth - 24) : [];
  const transparency = invoice.type === "B" ? 34 : 0;
  const needed = rows.length * 15 + 20 + transparency + (notes.length ? notes.length * 11 + 26 : 0);
  if (y - needed < MARGIN + footerSpace) {
    page = doc.addPage([PAGE.width, PAGE.height]);
    pages.push(page);
    y = continuationHeader(page);
  }
  y -= 14;
  const totalsWidth = 230;
  const tx = right - totalsWidth;
  box(page, tx, y - rows.length * 15 - 8, totalsWidth, rows.length * 15 + 8);
  rows.forEach(([label, cents], i) => {
    const last = i === rows.length - 1;
    const ry = y - 14 - i * 15;
    text(page, `${label}:`, tx + 10, ry, last ? 10 : 8.5, last ? bold : regular, last ? INK : MUTED);
    textRight(page, formatMoney(cents), right - 10, ry, last ? 10 : 8.5, last ? bold : regular);
  });
  y -= rows.length * 15 + 20;

  if (invoice.type === "B") {
    text(page, "Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)", MARGIN, y, 8, bold);
    text(page, `IVA contenido: ${formatMoney(invoice.totals.ivaCents)}`, MARGIN, y - 12, 8);
    y -= transparency;
  }

  if (notes.length) {
    text(page, "Observaciones", MARGIN, y, 8.5, bold);
    notes.forEach((row, i) => text(page, row, MARGIN, y - 13 - i * 11, 8.5, regular, MUTED));
  }

  // --- Pie de cada página y sello de anulada ------------------------------------------
  const disclaimer =
    "Comprobante de prueba generado con Talonario: no fue autorizado por ARCA (no tiene CAE) y no tiene validez fiscal.";
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: MARGIN, y: MARGIN + 18 }, end: { x: right, y: MARGIN + 18 }, thickness: 0.4, color: RULE });
    text(p, disclaimer, MARGIN, MARGIN + 6, 7, regular, MUTED);
    textRight(p, `Página ${i + 1} de ${pages.length}`, right, MARGIN - 6, 7, regular, MUTED);
    if (invoice.status === "cancelled") {
      const word = "ANULADA";
      const s = 72;
      const w = bold.widthOfTextAtSize(word, s);
      p.drawText(word, {
        x: PAGE.width / 2 - (w / 2) * Math.cos(Math.PI / 6),
        y: PAGE.height / 2 - (w / 2) * Math.sin(Math.PI / 6),
        size: s,
        font: bold,
        color: STAMP,
        opacity: 0.35,
        rotate: degrees(30),
      });
    }
  });

  return doc.save();
}
