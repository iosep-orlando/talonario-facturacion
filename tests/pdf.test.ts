import { readFileSync } from "node:fs";
import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { computeTotals } from "@/lib/invoice";
import { TYPE_CODE, pdfSafe, renderInvoicePdf, wrap, type PdfInvoice } from "@/lib/pdf";
import type { InvoiceLine, InvoiceType } from "@/lib/types";

const png = new Uint8Array(readFileSync("tests/fixtures/logo.png"));
const jpg = new Uint8Array(readFileSync("tests/fixtures/logo.jpg"));

function invoice(type: InvoiceType, lines: InvoiceLine[], patch: Partial<PdfInvoice> = {}): PdfInvoice {
  return {
    type,
    status: "issued",
    pointOfSale: 1,
    number: 42,
    issueDate: "2026-11-23",
    dueDate: "2026-12-08",
    issuer: {
      businessName: "Tostadero La Esquina",
      cuit: "20123456786",
      ivaCondition: type === "C" ? "MONOTRIBUTO" : "RI",
      address: "Av. Corrientes 4521, CABA",
      pointOfSale: 1,
      activityStart: "2019-03-01",
    },
    client: { name: "Ñandú Café S.R.L.", taxId: "20123456786", ivaCondition: "RI", email: "", address: "Thames 1720" },
    lines,
    totals: computeTotals(lines, type),
    notes: "",
    ...patch,
  };
}

const L = (description: string, ivaRate: InvoiceLine["ivaRate"] = 2100): InvoiceLine => ({
  description,
  quantity: 250,
  unitPriceCents: 1850000,
  ivaRate,
});

async function load(bytes: Uint8Array) {
  expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  return PDFDocument.load(bytes);
}

describe("PDF de la factura", () => {
  it("A con IVA discriminado, logo PNG y observaciones", async () => {
    const pdf = await load(
      await renderInvoicePdf(invoice("A", [L("Café 1 kg"), L("Pan", 1050), L("Libro", 0)], { notes: "Transferir al CBU 0170…" }), {
        bytes: png,
        contentType: "image/png",
      }),
    );
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe("Factura A 0001-00000042");
    expect(pdf.getAuthor()).toBe("Tostadero La Esquina");
  });

  it("B con IVA contenido y logo JPG", async () => {
    const pdf = await load(await renderInvoicePdf(invoice("B", [L("Café")]), { bytes: jpg, contentType: "image/jpeg" }));
    expect(pdf.getTitle()).toBe("Factura B 0001-00000042");
  });

  it("C, anulada y sin inicio de actividades", async () => {
    const base = invoice("C", [L("Curso")]);
    const pdf = await load(await renderInvoicePdf({ ...base, status: "cancelled", issuer: { ...base.issuer, activityStart: "" } }));
    expect(pdf.getTitle()).toBe("Factura C 0001-00000042");
  });

  it("un logo dañado no impide la factura", async () => {
    const pdf = await load(await renderInvoicePdf(invoice("A", [L("Café")]), { bytes: new Uint8Array([1, 2, 3]), contentType: "image/png" }));
    expect(pdf.getPageCount()).toBe(1);
  });

  it("muchas líneas: sigue en otra página, con el pie al final", async () => {
    const lines = Array.from({ length: 50 }, (_, i) => L(`Línea ${i + 1} con una descripción bastante larga para que ocupe dos renglones en la tabla de la factura`));
    const pdf = await load(await renderInvoicePdf(invoice("A", lines, { notes: "Observación ".repeat(40) })));
    expect(pdf.getPageCount()).toBeGreaterThan(2);
  });

  it("caracteres fuera de la fuente (emoji, chino) no rompen el PDF", async () => {
    const pdf = await load(await renderInvoicePdf(invoice("A", [L("Café ☕ 咖啡 ñandú ¿sí? €")], { notes: "🎉" })));
    expect(pdf.getPageCount()).toBe(1);
  });

  it("es determinístico: la misma factura da el mismo PDF", async () => {
    const a = await renderInvoicePdf(invoice("B", [L("Café")]));
    const b = await renderInvoicePdf(invoice("B", [L("Café")]));
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it("códigos de comprobante de ARCA", () => {
    expect(TYPE_CODE).toEqual({ A: "01", B: "06", C: "11" });
  });
});

describe("texto en el PDF", () => {
  let font: PDFFont;
  beforeAll(async () => {
    font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
  });

  it("cambia lo que la fuente no tiene por ?", () => {
    expect(pdfSafe(font, "Ñandú ¿sí? €")).toBe("Ñandú ¿sí? €");
    expect(pdfSafe(font, "café ☕")).toBe("café ?");
    expect(pdfSafe(font, "a\nb\tc")).toBe("a b c");
  });

  it("corta en renglones y parte las palabras larguísimas", () => {
    const rows = wrap(font, "uno dos tres cuatro cinco seis", 10, 60);
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) expect(font.widthOfTextAtSize(row, 10)).toBeLessThanOrEqual(60);
    const long = wrap(font, "x".repeat(200), 10, 50);
    expect(long.join("")).toBe("x".repeat(200));
    for (const row of long) expect(font.widthOfTextAtSize(row, 10)).toBeLessThanOrEqual(50);
    expect(wrap(font, "", 10, 50)).toEqual([""]);
  });
});
