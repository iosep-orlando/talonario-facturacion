import { isIvaRate, lineNet } from "./invoice";
import { MAX_AMOUNT_CENTS } from "./money";
import { isDateString } from "./format";
import type { InvoiceLine, IssuerCondition, IvaCondition, Preferences } from "./types";

// ---------------------------------------------------------------------------
// Validación de todo lo que llega del navegador. El navegador también
// valida, para avisar antes, pero la que vale es esta.
// ---------------------------------------------------------------------------

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: string): Result<T> => ({ ok: false, error });

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const OBJECT_ID_RE = /^[0-9a-f]{24}$/;

// --- Email ------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

export function normalizeEmail(value: unknown): string {
  return text(value).toLowerCase();
}

export function validateEmail(value: unknown): Result<string> {
  const email = normalizeEmail(value);
  if (!EMAIL_RE.test(email) || email.length > 254) return fail("Ese email no parece válido.");
  return ok(email);
}

// --- CUIT y DNI -----------------------------------------------------------------------

const CUIT_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Solo los dígitos: "20-12345678-6" → "20123456786". */
export const digits = (value: unknown) => text(value).replace(/[\s.-]/g, "");

/**
 * El último dígito del CUIT es de verificación (módulo 11): así se cazan
 * los errores de tipeo, como hace ARCA.
 */
export function isValidCuit(value: string): boolean {
  if (!/^\d{11}$/.test(value)) return false;
  const sum = CUIT_WEIGHTS.reduce((acc, w, i) => acc + w * Number(value[i]), 0);
  const check = 11 - (sum % 11);
  const expected = check === 11 ? 0 : check;
  return expected !== 10 && expected === Number(value[10]);
}

/** "20123456786" → "20-12345678-6". */
export function formatCuit(value: string): string {
  return /^\d{11}$/.test(value) ? `${value.slice(0, 2)}-${value.slice(2, 10)}-${value.slice(10)}` : value;
}

/** "CUIT 20-12345678-6", "DNI 12.345.678" o "". */
export function formatTaxId(value: string): string {
  if (value.length === 11) return `CUIT ${formatCuit(value)}`;
  if (/^\d{7,8}$/.test(value)) return `DNI ${Number(value).toLocaleString("es-AR")}`;
  return "";
}

const IVA_CONDITIONS: IvaCondition[] = ["RI", "MONOTRIBUTO", "EXENTO", "CONSUMIDOR_FINAL"];

export function isIvaCondition(value: unknown): value is IvaCondition {
  return IVA_CONDITIONS.includes(value as IvaCondition);
}

/**
 * CUIT obligatorio para inscriptos, monotributistas y exentos. Un
 * consumidor final puede ir con DNI o sin documento.
 */
export function validateTaxId(value: unknown, condition: IvaCondition): Result<string> {
  const id = digits(value);
  if (condition !== "CONSUMIDOR_FINAL") {
    if (!id) return fail("Falta el CUIT.");
    if (!isValidCuit(id)) return fail("Ese CUIT no es válido: revisá los 11 números.");
    return ok(id);
  }
  if (!id) return ok("");
  if (/^\d{7,8}$/.test(id)) return ok(id);
  if (isValidCuit(id)) return ok(id);
  return fail("Poné un DNI (7 u 8 números) o un CUIT válido, o dejalo vacío.");
}

// --- Clientes ------------------------------------------------------------------------

export interface ClientInput {
  name: string;
  taxId: string;
  ivaCondition: IvaCondition;
  email: string;
  address: string;
}

export function validateClient(body: Record<string, unknown>): Result<ClientInput> {
  const name = text(body.name);
  if (!name) return fail("Falta el nombre o la razón social.");
  if (name.length > 120) return fail("El nombre puede tener hasta 120 caracteres.");
  if (!isIvaCondition(body.ivaCondition)) return fail("Elegí la condición frente al IVA.");
  const taxId = validateTaxId(body.taxId, body.ivaCondition);
  if (!taxId.ok) return taxId;
  let email = "";
  if (text(body.email)) {
    const valid = validateEmail(body.email);
    if (!valid.ok) return valid;
    email = valid.value;
  }
  const address = text(body.address);
  if (address.length > 200) return fail("El domicilio puede tener hasta 200 caracteres.");
  return ok({ name, taxId: taxId.value, ivaCondition: body.ivaCondition, email, address });
}

// --- Datos del emisor y preferencias ---------------------------------------------------------

export interface ProfileInput {
  businessName: string;
  cuit: string;
  ivaCondition: IssuerCondition;
  address: string;
  pointOfSale: number;
  activityStart: string;
}

export function validateProfile(body: Record<string, unknown>): Result<ProfileInput> {
  const businessName = text(body.businessName);
  if (!businessName) return fail("Falta tu nombre o razón social.");
  if (businessName.length > 120) return fail("La razón social puede tener hasta 120 caracteres.");
  const condition = body.ivaCondition;
  if (condition !== "RI" && condition !== "MONOTRIBUTO" && condition !== "EXENTO") {
    return fail("Elegí tu condición frente al IVA.");
  }
  const cuit = digits(body.cuit);
  if (!isValidCuit(cuit)) return fail("Ese CUIT no es válido: revisá los 11 números.");
  const address = text(body.address);
  if (!address) return fail("Falta el domicilio comercial.");
  if (address.length > 200) return fail("El domicilio puede tener hasta 200 caracteres.");
  const pointOfSale = Number(body.pointOfSale);
  if (!Number.isInteger(pointOfSale) || pointOfSale < 1 || pointOfSale > 99_999) {
    return fail("El punto de venta es un número de 1 a 99999.");
  }
  const activityStart = text(body.activityStart);
  if (activityStart && !isDateString(activityStart)) return fail("La fecha de inicio de actividades no es válida.");
  return ok({ businessName, cuit, ivaCondition: condition, address, pointOfSale, activityStart });
}

export const DEFAULT_PREFERENCES: Preferences = { defaultIvaRate: 2100, defaultDueDays: 15 };

export function validatePreferences(body: Record<string, unknown>): Result<Preferences> {
  if (!isIvaRate(body.defaultIvaRate)) return fail("Elegí una alícuota de IVA.");
  const days = Number(body.defaultDueDays);
  if (!Number.isInteger(days) || days < 0 || days > 365) return fail("El vencimiento va de 0 a 365 días.");
  return ok({ defaultIvaRate: body.defaultIvaRate, defaultDueDays: days });
}

// --- Borrador de factura ----------------------------------------------------------------

export const MAX_LINES = 50;
/** Tope por línea: así el total de 50 líneas con IVA entra holgado en un entero exacto. */
export const MAX_LINE_CENTS = 10_000_000_000_000; // $ 100.000 millones

export interface DraftInput {
  clientId: string;
  dueDate: string;
  lines: InvoiceLine[];
  notes: string;
}

const isWhole = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;

/** Las líneas llegan con enteros: centavos y centésimos (el navegador ya convirtió el texto). */
export function validateLines(value: unknown): Result<InvoiceLine[]> {
  if (!Array.isArray(value) || value.length === 0) return fail("La factura necesita al menos una línea.");
  if (value.length > MAX_LINES) return fail(`Hasta ${MAX_LINES} líneas por factura.`);
  const lines: InvoiceLine[] = [];
  for (const [index, raw] of value.entries()) {
    const n = index + 1;
    const line = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    const description = text(line.description);
    if (!description) return fail(`Línea ${n}: falta la descripción.`);
    if (description.length > 200) return fail(`Línea ${n}: la descripción puede tener hasta 200 caracteres.`);
    if (!isWhole(line.quantity, 1, 100_000_000)) return fail(`Línea ${n}: la cantidad no es válida.`);
    if (!isWhole(line.unitPriceCents, 0, MAX_AMOUNT_CENTS)) return fail(`Línea ${n}: el precio no es válido.`);
    if (!isIvaRate(line.ivaRate)) return fail(`Línea ${n}: elegí la alícuota de IVA.`);
    const parsed: InvoiceLine = {
      description,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      ivaRate: line.ivaRate,
    };
    if (lineNet(parsed) > MAX_LINE_CENTS) return fail(`Línea ${n}: el importe es demasiado grande.`);
    lines.push(parsed);
  }
  return ok(lines);
}

export function validateDraft(body: Record<string, unknown>): Result<DraftInput> {
  const clientId = text(body.clientId);
  if (!OBJECT_ID_RE.test(clientId)) return fail("Elegí un cliente.");
  if (!isDateString(body.dueDate)) return fail("La fecha de vencimiento no es válida.");
  const lines = validateLines(body.lines);
  if (!lines.ok) return lines;
  const notes = text(body.notes);
  if (notes.length > 1000) return fail("Las observaciones pueden tener hasta 1000 caracteres.");
  return ok({ clientId, dueDate: body.dueDate, lines: lines.value, notes });
}
