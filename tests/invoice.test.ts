import { describe, expect, it } from "vitest";
import {
  CONDITION_LABEL,
  IVA_RATE_LABEL,
  STATUS_LABEL,
  canCancel,
  canDelete,
  canEdit,
  canIssue,
  canMarkPaid,
  canSend,
  canUnmarkPaid,
  computeTotals,
  effectiveRate,
  formatInvoiceNumber,
  hasPdf,
  invoiceTitle,
  invoiceType,
  isIvaRate,
  isOverdue,
  ivaOf,
  lineGross,
  lineNet,
  totalRows,
} from "@/lib/invoice";
import type { InvoiceLine, InvoiceStatus } from "@/lib/types";

const line = (quantity: number, unitPriceCents: number, ivaRate: InvoiceLine["ivaRate"] = 2100): InvoiceLine => ({
  description: "x",
  quantity,
  unitPriceCents,
  ivaRate,
});

describe("letra de la factura", () => {
  it("responsable inscripto: A a inscriptos y monotributistas, B al resto", () => {
    expect(invoiceType("RI", "RI")).toBe("A");
    expect(invoiceType("RI", "MONOTRIBUTO")).toBe("A");
    expect(invoiceType("RI", "CONSUMIDOR_FINAL")).toBe("B");
    expect(invoiceType("RI", "EXENTO")).toBe("B");
  });
  it("monotributista, exento o sin datos: siempre C", () => {
    for (const client of ["RI", "MONOTRIBUTO", "EXENTO", "CONSUMIDOR_FINAL"] as const) {
      expect(invoiceType("MONOTRIBUTO", client)).toBe("C");
      expect(invoiceType("EXENTO", client)).toBe("C");
      expect(invoiceType(null, client)).toBe("C");
    }
  });
  it("una C no lleva IVA", () => {
    expect(effectiveRate("C", 2100)).toBe(0);
    expect(effectiveRate("A", 1050)).toBe(1050);
  });
});

describe("cálculo en centavos", () => {
  it("cantidad en centésimos × precio en centavos, redondeando la mitad para arriba", () => {
    expect(lineNet(line(300, 123457))).toBe(370371);
    expect(lineNet(line(150, 1001))).toBe(1502); // 1501,5 → 1502
    expect(lineNet(line(150, 999))).toBe(1499); // 1498,5 → 1499
    expect(lineNet(line(1, 1))).toBe(0); // 0,01 × $0,01
  });
  it("IVA por alícuota", () => {
    expect(ivaOf(370371, 2100)).toBe(77778); // 77.777,91
    expect(ivaOf(1000, 1050)).toBe(105);
    expect(ivaOf(1000, 2700)).toBe(270);
    expect(ivaOf(1000, 0)).toBe(0);
    expect(ivaOf(50, 1050)).toBe(5); // 5,25 → 5
    expect(ivaOf(10, 2100)).toBe(2); // 2,1 → 2
    expect(ivaOf(50, 2100)).toBe(11); // 10,5 → 11
  });
  it("no pierde precisión con importes enormes (BigInt)", () => {
    // $ 90.000 millones: en coma flotante la multiplicación se pasaría de 2^53.
    expect(lineNet(line(100, 9_000_000_000_000))).toBe(9_000_000_000_000);
    expect(ivaOf(9_000_000_000_001, 2100)).toBe(1_890_000_000_000);
  });

  it("totales: suma de enteros, IVA agrupado por alícuota y ordenado", () => {
    const lines = [line(300, 123457), line(100, 10000, 1050), line(200, 5000, 0), line(100, 1000)];
    const t = computeTotals(lines, "A");
    expect(t.netCents).toBe(370371 + 10000 + 10000 + 1000);
    expect(t.byRate).toEqual([
      { rate: 2100, netCents: 371371, ivaCents: 77778 + 210 },
      { rate: 1050, netCents: 10000, ivaCents: 1050 },
      { rate: 0, netCents: 10000, ivaCents: 0 },
    ]);
    expect(t.ivaCents).toBe(77988 + 1050);
    expect(t.totalCents).toBe(t.netCents + t.ivaCents);
  });

  it("en una B la suma de las líneas con IVA da exactamente el total", () => {
    const lines = [line(100, 333), line(700, 1999), line(150, 101, 1050)];
    const t = computeTotals(lines, "B");
    expect(lines.reduce((sum, l) => sum + lineGross(l, "B"), 0)).toBe(t.totalCents);
  });

  it("una C ignora las alícuotas", () => {
    const t = computeTotals([line(100, 10000, 2100), line(100, 500, 1050)], "C");
    expect(t).toEqual({ netCents: 10500, ivaCents: 0, totalCents: 10500, byRate: [{ rate: 0, netCents: 10500, ivaCents: 0 }] });
    expect(lineGross(line(100, 10000), "C")).toBe(10000);
  });

  it("sin líneas, cero", () => {
    expect(computeTotals([], "A")).toEqual({ netCents: 0, ivaCents: 0, totalCents: 0, byRate: [] });
  });
});

describe("pie de la factura", () => {
  it("A: neto gravado, exento, IVA por alícuota y total", () => {
    const t = computeTotals([line(100, 10000), line(100, 2000, 0), line(100, 1000, 2700)], "A");
    expect(totalRows("A", t)).toEqual([
      ["Importe neto gravado", 11000],
      ["Importe exento", 2000],
      ["IVA 27 %", 270],
      ["IVA 21 %", 2100],
      ["Importe total", 15370],
    ]);
  });
  it("A sin exento no muestra la fila", () => {
    const rows = totalRows("A", computeTotals([line(100, 100)], "A"));
    expect(rows.map((r) => r[0])).toEqual(["Importe neto gravado", "IVA 21 %", "Importe total"]);
  });
  it("B y C: subtotal y total", () => {
    const t = computeTotals([line(100, 10000)], "B");
    expect(totalRows("B", t)).toEqual([["Subtotal", 12100], ["Importe total", 12100]]);
  });
});

describe("numeración y estados", () => {
  it("formato de ARCA", () => {
    expect(formatInvoiceNumber(1, 42)).toBe("0001-00000042");
    expect(formatInvoiceNumber(12345, 12345678)).toBe("12345-12345678");
    expect(formatInvoiceNumber(null, null)).toBe("Sin número");
    expect(invoiceTitle({ type: "B", pointOfSale: 3, number: 7 })).toBe("Factura B 0003-00000007");
    expect(invoiceTitle({ type: "A", pointOfSale: null, number: null })).toBe("Borrador de factura A");
  });

  const table: [InvoiceStatus, Record<string, boolean>][] = [
    ["draft", { edit: true, issue: true, del: true, pay: false, unpay: false, cancel: false, send: false, pdf: false }],
    ["issued", { edit: false, issue: false, del: false, pay: true, unpay: false, cancel: true, send: true, pdf: true }],
    ["paid", { edit: false, issue: false, del: false, pay: false, unpay: true, cancel: false, send: true, pdf: true }],
    ["cancelled", { edit: false, issue: false, del: false, pay: false, unpay: false, cancel: false, send: false, pdf: true }],
  ];
  it.each(table)("qué se puede hacer con una %s", (status, can) => {
    expect({
      edit: canEdit(status),
      issue: canIssue(status),
      del: canDelete(status),
      pay: canMarkPaid(status),
      unpay: canUnmarkPaid(status),
      cancel: canCancel(status),
      send: canSend(status),
      pdf: hasPdf(status),
    }).toEqual(can);
  });

  it("vencida: emitida, sin pagar y con el vencimiento pasado", () => {
    expect(isOverdue("issued", "2026-11-22", "2026-11-23")).toBe(true);
    expect(isOverdue("issued", "2026-11-23", "2026-11-23")).toBe(false);
    expect(isOverdue("paid", "2026-01-01", "2026-11-23")).toBe(false);
    expect(isOverdue("cancelled", "2026-01-01", "2026-11-23")).toBe(false);
  });

  it("etiquetas", () => {
    expect(isIvaRate(1050)).toBe(true);
    expect(isIvaRate(1000)).toBe(false);
    expect(isIvaRate("2100")).toBe(false);
    expect(IVA_RATE_LABEL[1050]).toBe("10,5 %");
    expect(CONDITION_LABEL.MONOTRIBUTO).toBe("Monotributista");
    expect(STATUS_LABEL.cancelled).toBe("Anulada");
  });
});
