import { MongoClient, ObjectId, type Db, type WithId } from "mongodb";
import { isOverdue } from "./invoice";
import type {
  ClientDTO,
  ClientSnapshot,
  InvoiceDTO,
  InvoiceLine,
  InvoiceStatus,
  InvoiceSummaryDTO,
  InvoiceTotals,
  InvoiceType,
  IssuerProfile,
  IssuerSnapshot,
  IvaCondition,
  Preferences,
} from "./types";

// ---------------------------------------------------------------------------
// MongoDB: UN cliente por proceso (singleton), las colecciones y sus índices.
// Ninguna ruta crea su propio MongoClient: todas pasan por collections().
//
// Cada usuario ve solo lo suyo: clientes, facturas y contadores llevan
// `userId`, y toda consulta lo filtra con el usuario de la sesión
// (lib/auth.ts). Nunca con un id que venga en la petición.
// ---------------------------------------------------------------------------

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function getClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Falta la variable de entorno "MONGODB_URI"');
  // En globalThis: en desarrollo la recarga en caliente vuelve a ejecutar
  // los módulos, y sin esto abriría una conexión nueva en cada cambio.
  global._mongoClientPromise ??= new MongoClient(uri).connect();
  return global._mongoClientPromise;
}

/** MONGODB_DB, si no el nombre de la URI, si no "saas_facturacion". */
export function databaseName(uri: string | undefined, explicit: string | undefined): string {
  if (explicit) return explicit;
  const match = uri?.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : "saas_facturacion";
}

export async function getDb(): Promise<Db> {
  return (await getClient()).db(databaseName(process.env.MONGODB_URI, process.env.MONGODB_DB));
}

/** Para los scripts: cierra la conexión y deja terminar el proceso. */
export async function closeDb(): Promise<void> {
  const client = await global._mongoClientPromise;
  await client?.close();
  global._mongoClientPromise = undefined;
}

// --- Documentos --------------------------------------------------------------

export interface UserDoc {
  email: string;
  profile: IssuerProfile;
  /** El logo vive en el bucket S3; acá, dónde está. */
  logo: { key: string; contentType: string; size: number; updatedAt: Date } | null;
  preferences: Preferences;
  createdAt: Date;
}

export interface LoginTokenDoc {
  /** Solo el hash: si alguien lee la base, no puede entrar con los enlaces. */
  tokenHash: string;
  email: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface ClientDoc {
  userId: ObjectId;
  name: string;
  taxId: string;
  ivaCondition: IvaCondition;
  email: string;
  address: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceDoc {
  userId: ObjectId;
  clientId: ObjectId;
  status: InvoiceStatus;
  type: InvoiceType;
  pointOfSale: number | null;
  number: number | null;
  /**
   * Copia del cliente y del emisor. En el borrador se actualiza al guardar;
   * al emitir queda fija: si después cambia el domicilio del cliente, la
   * factura ya emitida sigue diciendo lo que decía.
   */
  client: ClientSnapshot;
  issuer: IssuerSnapshot | null;
  issueDate: string | null;
  dueDate: string;
  lines: InvoiceLine[];
  notes: string;
  totals: InvoiceTotals;
  /** El PDF en el bucket (se genera al emitir; si falta, al descargarlo). */
  pdfKey: string | null;
  paidAt: Date | null;
  cancelledAt: Date | null;
  lastSentAt: Date | null;
  lastSentTo: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** El último número usado por punto de venta y letra. */
export interface CounterDoc {
  userId: ObjectId;
  pointOfSale: number;
  type: InvoiceType;
  seq: number;
}

/** Un mail guardado en la bandeja de demo (MAIL_TRANSPORT=outbox) en vez de enviarse. */
export interface OutboxDoc {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  attachments: { filename: string; size: number; contentType: string }[];
  createdAt: Date;
}

let indexes: Promise<unknown> | undefined;

export async function collections() {
  const db = await getDb();
  const c = {
    users: db.collection<UserDoc>("users"),
    loginTokens: db.collection<LoginTokenDoc>("loginTokens"),
    clients: db.collection<ClientDoc>("clients"),
    invoices: db.collection<InvoiceDoc>("invoices"),
    counters: db.collection<CounterDoc>("counters"),
    outbox: db.collection<OutboxDoc>("outbox"),
  };
  indexes ??= Promise.all([
    c.users.createIndex({ email: 1 }, { unique: true }),
    c.loginTokens.createIndex({ tokenHash: 1 }, { unique: true }),
    c.loginTokens.createIndex({ email: 1, createdAt: -1 }),
    // MongoDB borra solo los enlaces vencidos (índice TTL).
    c.loginTokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    c.clients.createIndex({ userId: 1, name: 1 }),
    c.invoices.createIndex({ userId: 1, createdAt: -1 }),
    c.invoices.createIndex({ userId: 1, status: 1, dueDate: 1 }),
    c.invoices.createIndex({ userId: 1, clientId: 1 }),
    // Red de seguridad: dos facturas emitidas nunca comparten número.
    c.invoices.createIndex(
      { userId: 1, pointOfSale: 1, type: 1, number: 1 },
      { unique: true, partialFilterExpression: { number: { $type: "number" } } },
    ),
    c.counters.createIndex({ userId: 1, pointOfSale: 1, type: 1 }, { unique: true }),
    // La bandeja de demo se vacía sola: cada mail dura 3 días.
    c.outbox.createIndex({ createdAt: 1 }, { expireAfterSeconds: 3 * 24 * 60 * 60 }),
    c.outbox.createIndex({ to: 1, createdAt: -1 }),
  ]);
  await indexes;
  return c;
}

export type Collections = Awaited<ReturnType<typeof collections>>;

/** ObjectId de un texto, o null si no es un id válido (evita un 500 con ids basura). */
export function toObjectId(id: unknown): ObjectId | null {
  return typeof id === "string" && ObjectId.isValid(id) && String(new ObjectId(id)) === id ? new ObjectId(id) : null;
}

export const EMPTY_PROFILE: IssuerProfile = {
  businessName: "",
  cuit: "",
  ivaCondition: null,
  address: "",
  pointOfSale: 1,
  activityStart: "",
};

// --- Documento → DTO -------------------------------------------------------------

const iso = (date: Date | null) => date?.toISOString() ?? null;

export function clientToDTO(doc: WithId<ClientDoc>): ClientDTO {
  return {
    id: doc._id.toString(),
    name: doc.name,
    taxId: doc.taxId,
    ivaCondition: doc.ivaCondition,
    email: doc.email,
    address: doc.address,
    createdAt: doc.createdAt.toISOString(),
  };
}

export function invoiceToDTO(doc: WithId<InvoiceDoc>): InvoiceDTO {
  return {
    id: doc._id.toString(),
    status: doc.status,
    type: doc.type,
    pointOfSale: doc.pointOfSale,
    number: doc.number,
    clientId: doc.clientId.toString(),
    client: doc.client,
    issuer: doc.issuer,
    issueDate: doc.issueDate,
    dueDate: doc.dueDate,
    lines: doc.lines,
    notes: doc.notes,
    totals: doc.totals,
    paidAt: iso(doc.paidAt),
    cancelledAt: iso(doc.cancelledAt),
    lastSentAt: iso(doc.lastSentAt),
    lastSentTo: doc.lastSentTo,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function invoiceToSummary(doc: WithId<InvoiceDoc>, today: string): InvoiceSummaryDTO {
  return {
    id: doc._id.toString(),
    status: doc.status,
    type: doc.type,
    pointOfSale: doc.pointOfSale,
    number: doc.number,
    clientName: doc.client.name,
    issueDate: doc.issueDate,
    dueDate: doc.dueDate,
    totalCents: doc.totals.totalCents,
    overdue: isOverdue(doc.status, doc.dueDate, today),
  };
}
