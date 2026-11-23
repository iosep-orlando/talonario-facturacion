import type {
  InvoiceLine,
  InvoiceStatus,
  InvoiceTotals,
  InvoiceType,
  IssuerCondition,
  IvaCondition,
  IvaRate,
  RateTotal,
} from "./types";

// ---------------------------------------------------------------------------
// Las reglas de una factura argentina: qué letra lleva, cómo se calculan el
// IVA y los totales, cómo se numera y qué se puede hacer en cada estado.
//
// Sin conexión con ARCA (ex AFIP): no hay CAE, así que las facturas no son
// válidas como comprobante fiscal. El cálculo y la letra sí siguen las
// reglas reales.
// ---------------------------------------------------------------------------

export const IVA_RATES: readonly IvaRate[] = [2100, 1050, 2700, 0];

export const IVA_RATE_LABEL: Record<IvaRate, string> = {
  2100: "21 %",
  1050: "10,5 %",
  2700: "27 %",
  0: "Exento",
};

export function isIvaRate(value: unknown): value is IvaRate {
  return IVA_RATES.includes(value as IvaRate);
}

export const CONDITION_LABEL: Record<IvaCondition, string> = {
  RI: "Responsable inscripto",
  MONOTRIBUTO: "Monotributista",
  EXENTO: "IVA exento",
  CONSUMIDOR_FINAL: "Consumidor final",
};

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Borrador",
  issued: "Emitida",
  paid: "Pagada",
  cancelled: "Anulada",
};

/**
 * La letra de la factura.
 *
 * - Un responsable inscripto le hace A a otro inscripto o a un
 *   monotributista (los dos pueden usar el IVA), y B a un consumidor final
 *   o a un exento.
 * - Un monotributista o un exento no cobra IVA: siempre hace C.
 */
export function invoiceType(issuer: IssuerCondition | null, client: IvaCondition): InvoiceType {
  if (issuer !== "RI") return "C";
  return client === "RI" || client === "MONOTRIBUTO" ? "A" : "B";
}

/** En una factura C no hay IVA: todas las líneas van sin alícuota. */
export function effectiveRate(type: InvoiceType, rate: IvaRate): IvaRate {
  return type === "C" ? 0 : rate;
}

// --- Cálculo, en enteros ------------------------------------------------------------
//
// Con BigInt para que ni la multiplicación intermedia (cantidad × precio)
// pierda precisión. Los redondeos son "al centavo más cercano, la mitad
// hacia arriba", y se hacen por línea: así, en una factura B (precios con
// IVA incluido) la suma de las líneas da exactamente el total.

const divRound = (a: bigint, b: bigint) => (a + b / 2n) / b;

/** Importe sin IVA de una línea: cantidad (centésimos) × precio (centavos). */
export function lineNet(line: Pick<InvoiceLine, "quantity" | "unitPriceCents">): number {
  return Number(divRound(BigInt(line.quantity) * BigInt(line.unitPriceCents), 100n));
}

/** IVA de un importe con una alícuota (en puntos básicos). */
export function ivaOf(netCents: number, rate: IvaRate): number {
  return Number(divRound(BigInt(netCents) * BigInt(rate), 10_000n));
}

/** Importe de una línea con su IVA, como se muestra en una factura B. */
export function lineGross(line: InvoiceLine, type: InvoiceType): number {
  const net = lineNet(line);
  return net + ivaOf(net, effectiveRate(type, line.ivaRate));
}

export function computeTotals(lines: InvoiceLine[], type: InvoiceType): InvoiceTotals {
  const byRate = new Map<IvaRate, RateTotal>();
  let net = 0;
  let iva = 0;
  for (const line of lines) {
    const rate = effectiveRate(type, line.ivaRate);
    const lineNetCents = lineNet(line);
    const lineIvaCents = ivaOf(lineNetCents, rate);
    net += lineNetCents;
    iva += lineIvaCents;
    const row = byRate.get(rate) ?? { rate, netCents: 0, ivaCents: 0 };
    row.netCents += lineNetCents;
    row.ivaCents += lineIvaCents;
    byRate.set(rate, row);
  }
  return {
    netCents: net,
    ivaCents: iva,
    totalCents: net + iva,
    byRate: [...byRate.values()].sort((a, b) => b.rate - a.rate),
  };
}

/**
 * Las filas del pie de la factura: en una A, el neto gravado, lo exento y
 * el IVA de cada alícuota; en una B o una C, el total (en la B el IVA va
 * incluido en los precios).
 */
export function totalRows(type: InvoiceType, totals: InvoiceTotals): [string, number][] {
  if (type !== "A") return [["Subtotal", totals.totalCents], ["Importe total", totals.totalCents]];
  const taxed = totals.byRate.filter((r) => r.rate > 0).reduce((sum, r) => sum + r.netCents, 0);
  const exempt = totals.byRate.find((r) => r.rate === 0)?.netCents ?? 0;
  const rows: [string, number][] = [["Importe neto gravado", taxed]];
  if (exempt > 0) rows.push(["Importe exento", exempt]);
  for (const r of totals.byRate) if (r.rate > 0) rows.push([`IVA ${IVA_RATE_LABEL[r.rate]}`, r.ivaCents]);
  rows.push(["Importe total", totals.totalCents]);
  return rows;
}

// --- Numeración ------------------------------------------------------------------

/** "0001-00000042": punto de venta (4 cifras) y número (8), como en ARCA. */
export function formatInvoiceNumber(pointOfSale: number | null, number: number | null): string {
  if (pointOfSale === null || number === null) return "Sin número";
  return `${String(pointOfSale).padStart(4, "0")}-${String(number).padStart(8, "0")}`;
}

/** "Factura A 0001-00000042", o "Borrador" si no se emitió. */
export function invoiceTitle(inv: { type: InvoiceType; pointOfSale: number | null; number: number | null }): string {
  if (inv.number === null) return `Borrador de factura ${inv.type}`;
  return `Factura ${inv.type} ${formatInvoiceNumber(inv.pointOfSale, inv.number)}`;
}

// --- Qué se puede hacer en cada estado -------------------------------------------------

export const canEdit = (s: InvoiceStatus) => s === "draft";
export const canIssue = (s: InvoiceStatus) => s === "draft";
export const canDelete = (s: InvoiceStatus) => s === "draft";
export const canMarkPaid = (s: InvoiceStatus) => s === "issued";
export const canUnmarkPaid = (s: InvoiceStatus) => s === "paid";
/** Una pagada no se anula: primero hay que desmarcarla (devolver el pago). */
export const canCancel = (s: InvoiceStatus) => s === "issued";
export const canSend = (s: InvoiceStatus) => s === "issued" || s === "paid";
export const hasPdf = (s: InvoiceStatus) => s !== "draft";

/** Emitida, sin pagar y con el vencimiento ya pasado. */
export function isOverdue(status: InvoiceStatus, dueDate: string, today: string): boolean {
  return status === "issued" && dueDate < today;
}
