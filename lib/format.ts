// ---------------------------------------------------------------------------
// Fechas en hora argentina.
//
// Las fechas de una factura (emisión, vencimiento) son días de calendario,
// no instantes: se guardan como texto "AAAA-MM-DD". Así no se corren un
// día por la zona horaria (el servidor de Render está en UTC: a las 22 h
// de Buenos Aires allá ya es mañana) y se ordenan y comparan como texto.
// ---------------------------------------------------------------------------

export const TIME_ZONE = "America/Argentina/Buenos_Aires";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "AAAA-MM-DD" de un día que existe (no 2026-02-30). */
export function isDateString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return date.toISOString().slice(0, 10) === value;
}

/** El día de hoy en Argentina, "AAAA-MM-DD". */
export function todayAR(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Suma días a una fecha "AAAA-MM-DD". */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** "AAAA-MM" de la fecha, y los `count` meses hasta ese, del más viejo al actual. */
export function lastMonths(today: string, count: number): string[] {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(y, m - 1 - (count - 1 - i), 1));
    return date.toISOString().slice(0, 7);
  });
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_LONG = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "2026-11" → "nov". */
export function monthShort(month: string): string {
  return MONTHS[Number(month.slice(5, 7)) - 1] ?? month;
}

/** "2026-11" → "noviembre de 2026". */
export function monthLong(month: string): string {
  return `${MONTHS_LONG[Number(month.slice(5, 7)) - 1] ?? month} de ${month.slice(0, 4)}`;
}

/** "2026-11-23" → "23/11/2026", como en las facturas. */
export function formatDate(date: string | null): string {
  if (!date || !DATE_RE.test(date)) return "—";
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

const dateTime = new Intl.DateTimeFormat("es-AR", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "22 nov, 21:05" en hora argentina. */
export function formatDateTime(iso: string | null): string {
  return iso ? dateTime.format(new Date(iso)) : "—";
}

/** Días entre dos fechas "AAAA-MM-DD" (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** "1 factura" / "3 facturas". */
export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("es-AR")} ${n === 1 ? one : many}`;
}
