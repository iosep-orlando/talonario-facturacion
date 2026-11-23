/**
 * Adónde ir después de entrar: el `next` que dejó proxy.ts, solo si es una
 * página del panel. Nunca otra web (sería un redireccionador abierto).
 */
export function safeNext(next: unknown): string {
  return typeof next === "string" && /^\/panel(\/|\?|$)/.test(next) ? next : "/panel";
}
