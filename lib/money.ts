// ---------------------------------------------------------------------------
// Dinero en centavos: leer lo que se escribe y mostrarlo.
//
// Regla del proyecto: los importes se guardan y se operan como ENTEROS en
// centavos. Este archivo es el único lugar donde aparecen los "pesos": al
// leer un texto como "1.234,56" (sin pasar nunca por un número con
// decimales) y al mostrar un importe.
// ---------------------------------------------------------------------------

export type Parsed = { ok: true; value: number } | { ok: false; error: string };

/** El importe más alto que se acepta en un campo: $ 1.000.000.000.000. */
export const MAX_AMOUNT_CENTS = 100_000_000_000_000;

/**
 * Texto a un entero con `decimals` decimales, sin coma flotante.
 *
 * Acepta la forma argentina ("1.234,56", "1234,5") y la de la calculadora
 * ("1234.56"). La coma, si está, es el decimal y los puntos son de miles.
 * Sin coma, un punto seguido de exactamente tres cifras es de miles
 * ("1.500" = mil quinientos), y si no, es el decimal ("2.5").
 */
export function parseDecimal(input: string, decimals: number): Parsed {
  const text = input.trim().replace(/^\$\s*/, "").replace(/\s/g, "");
  if (!text) return { ok: false, error: "Falta el número." };
  if (text.startsWith("-")) return { ok: false, error: "No puede ser negativo." };

  let whole: string;
  let fraction = "";
  if (text.includes(",")) {
    const parts = text.split(",");
    if (parts.length !== 2) return { ok: false, error: "Número inválido." };
    whole = parts[0];
    fraction = parts[1];
    if (whole.includes(".") && !/^\d{1,3}(\.\d{3})+$/.test(whole)) return { ok: false, error: "Número inválido." };
    whole = whole.replace(/\./g, "");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    whole = text.replace(/\./g, "");
  } else {
    const parts = text.split(".");
    if (parts.length > 2) return { ok: false, error: "Número inválido." };
    whole = parts[0];
    fraction = parts[1] ?? "";
  }
  if (whole === "") whole = "0";
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction)) return { ok: false, error: "Número inválido." };
  if (fraction.length > decimals) {
    return { ok: false, error: decimals === 0 ? "Sin decimales." : `Hasta ${decimals} decimales.` };
  }
  if (whole.replace(/^0+/, "").length > 15) return { ok: false, error: "Es un número demasiado grande." };
  const value = Number(whole) * 10 ** decimals + Number(fraction.padEnd(decimals, "0") || "0");
  return { ok: true, value };
}

/** "1.234,56" → 123456 centavos. */
export function parseMoney(input: string): Parsed {
  const parsed = parseDecimal(input, 2);
  if (parsed.ok && parsed.value > MAX_AMOUNT_CENTS) return { ok: false, error: "Es un importe demasiado grande." };
  return parsed;
}

/** "1,5" → 150 centésimos. */
export function parseQuantity(input: string): Parsed {
  const parsed = parseDecimal(input, 2);
  if (!parsed.ok) return parsed;
  if (parsed.value === 0) return { ok: false, error: "La cantidad no puede ser cero." };
  if (parsed.value > 100_000_000) return { ok: false, error: "Hasta 1.000.000 de unidades." };
  return parsed;
}

const pesos = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/** Un entero con `decimals` decimales, en formato argentino: 123456 → "1.234,56". */
export function formatDecimal(value: number, decimals: number, keepZeros = true): string {
  const negative = value < 0;
  const abs = Math.abs(value);
  const scale = 10 ** decimals;
  const whole = Math.trunc(abs / scale);
  let fraction = String(abs % scale).padStart(decimals, "0");
  if (!keepZeros) fraction = fraction.replace(/0+$/, "");
  return `${negative ? "-" : ""}${pesos.format(whole)}${fraction ? `,${fraction}` : ""}`;
}

/** 123456 → "$ 1.234,56". */
export function formatMoney(cents: number): string {
  return `$ ${formatDecimal(cents, 2)}`;
}

/** 150 → "1,5"; 200 → "2". */
export function formatQuantity(hundredths: number): string {
  return formatDecimal(hundredths, 2, false);
}

/** Para volver a llenar un campo: 123456 → "1234,56" (sin puntos de miles). */
export function centsToInput(cents: number): string {
  return formatDecimal(cents, 2).replace(/\./g, "");
}

export function quantityToInput(hundredths: number): string {
  return formatQuantity(hundredths).replace(/\./g, "");
}
