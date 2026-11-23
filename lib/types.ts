// ---------------------------------------------------------------------------
// Tipos compartidos por el servidor y el navegador. Los documentos de
// MongoDB (con ObjectId y Date) están en lib/db.ts; acá, lo que viaja como
// JSON (DTO): ids como texto, fechas como texto.
//
// DINERO: todo importe es un entero en CENTAVOS (…Cents). Nunca un número
// con decimales: 0,1 + 0,2 no da 0,3 en coma flotante, y una factura tiene
// que cerrar al centavo. Solo al mostrarlo se divide por 100 (lib/money.ts).
// ---------------------------------------------------------------------------

/** Condición frente al IVA (la que figura en la constancia de ARCA). */
export type IvaCondition = "RI" | "MONOTRIBUTO" | "EXENTO" | "CONSUMIDOR_FINAL";

/** La del emisor: un consumidor final no factura. */
export type IssuerCondition = Exclude<IvaCondition, "CONSUMIDOR_FINAL">;

/** Alícuota de IVA en puntos básicos: 2100 = 21 %. 0 = exento. */
export type IvaRate = 0 | 1050 | 2100 | 2700;

export type InvoiceType = "A" | "B" | "C";

/**
 * Borrador → Emitida → Pagada. Una emitida también se puede anular.
 * Solo el borrador se edita o se borra: una factura emitida tiene número
 * y queda fija.
 */
export type InvoiceStatus = "draft" | "issued" | "paid" | "cancelled";

/** Cantidad en centésimos (150 = 1,5) para no usar decimales. */
export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPriceCents: number; // precio unitario SIN IVA
  ivaRate: IvaRate;
}

export interface RateTotal {
  rate: IvaRate;
  netCents: number;
  ivaCents: number;
}

export interface InvoiceTotals {
  netCents: number; // suma de los importes sin IVA
  ivaCents: number;
  totalCents: number;
  byRate: RateTotal[]; // una fila por alícuota usada, de mayor a menor
}

export interface Preferences {
  defaultIvaRate: IvaRate;
  defaultDueDays: number;
}

/** Los datos del emisor: salen en cada factura. */
export interface IssuerProfile {
  businessName: string;
  cuit: string; // 11 dígitos, sin guiones
  ivaCondition: IssuerCondition | null;
  address: string;
  pointOfSale: number; // 1 a 99999
  activityStart: string; // AAAA-MM-DD o ""
}

export interface MeDTO {
  user: { id: string; email: string };
  profile: IssuerProfile;
  hasLogo: boolean;
  /** Le faltan datos para emitir facturas. */
  profileComplete: boolean;
  preferences: Preferences;
}

export interface ClientDTO {
  id: string;
  name: string;
  taxId: string; // CUIT (11 dígitos), DNI (7 u 8) o ""
  ivaCondition: IvaCondition;
  email: string;
  address: string;
  createdAt: string;
}

/** Cómo quedan el emisor y el cliente en la factura al emitirla (copia fija). */
export interface IssuerSnapshot extends IssuerProfile {
  ivaCondition: IssuerCondition;
}

export interface ClientSnapshot {
  name: string;
  taxId: string;
  ivaCondition: IvaCondition;
  email: string;
  address: string;
}

export interface InvoiceDTO {
  id: string;
  status: InvoiceStatus;
  type: InvoiceType; // en un borrador, el que tendría si se emitiera hoy
  pointOfSale: number | null;
  number: number | null; // null hasta emitirla
  clientId: string;
  client: ClientSnapshot;
  issuer: IssuerSnapshot | null; // null en el borrador
  issueDate: string | null; // AAAA-MM-DD, al emitirla
  dueDate: string; // AAAA-MM-DD
  lines: InvoiceLine[];
  notes: string;
  totals: InvoiceTotals;
  paidAt: string | null;
  cancelledAt: string | null;
  lastSentAt: string | null;
  lastSentTo: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Una fila del listado (sin las líneas). */
export interface InvoiceSummaryDTO {
  id: string;
  status: InvoiceStatus;
  type: InvoiceType;
  pointOfSale: number | null;
  number: number | null;
  clientName: string;
  issueDate: string | null;
  dueDate: string;
  totalCents: number;
  overdue: boolean;
}
