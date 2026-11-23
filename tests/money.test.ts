import { describe, expect, it } from "vitest";
import {
  MAX_AMOUNT_CENTS,
  centsToInput,
  formatDecimal,
  formatMoney,
  formatQuantity,
  parseDecimal,
  parseMoney,
  parseQuantity,
  quantityToInput,
} from "@/lib/money";

describe("parseMoney: texto a centavos sin coma flotante", () => {
  it.each([
    ["1.234,56", 123456],
    ["1234,56", 123456],
    ["1234,5", 123450],
    ["1234.56", 123456],
    ["1.500", 150000], // punto de miles
    ["1.500.000", 150000000],
    ["2.5", 250], // punto decimal
    ["$ 99,99", 9999],
    ["  12 ", 1200],
    [",5", 50],
    ["0", 0],
    ["4,35", 435], // 4.35 * 100 en coma flotante da 434.99999999999994
    ["1.15", 115],
  ])("%s → %i", (text, cents) => {
    expect(parseMoney(text)).toEqual({ ok: true, value: cents });
  });

  it.each(["", "abc", "-5", "1,2,3", "1.23.4", "12.34.56,7", "1,234", "1e5", "1.2,3"])("rechaza %j", (text) => {
    expect(parseMoney(text).ok).toBe(false);
  });

  it("explica el error", () => {
    expect(parseMoney("")).toEqual({ ok: false, error: "Falta el número." });
    expect(parseMoney("-1")).toEqual({ ok: false, error: "No puede ser negativo." });
    expect(parseMoney("1,234")).toEqual({ ok: false, error: "Hasta 2 decimales." });
  });

  it("pone un tope", () => {
    expect(parseMoney("1.000.000.000.000")).toEqual({ ok: true, value: MAX_AMOUNT_CENTS });
    expect(parseMoney("1.000.000.000.000,01").ok).toBe(false);
    expect(parseMoney("9999999999999999").ok).toBe(false);
  });

  it("sin decimales cuando se piden 0", () => {
    expect(parseDecimal("1,5", 0)).toEqual({ ok: false, error: "Sin decimales." });
    expect(parseDecimal("15", 0)).toEqual({ ok: true, value: 15 });
  });
});

describe("parseQuantity: centésimos", () => {
  it("lee decimales", () => {
    expect(parseQuantity("1,5")).toEqual({ ok: true, value: 150 });
    expect(parseQuantity("3")).toEqual({ ok: true, value: 300 });
  });
  it("no acepta cero ni cantidades absurdas", () => {
    expect(parseQuantity("0")).toEqual({ ok: false, error: "La cantidad no puede ser cero." });
    expect(parseQuantity("1.000.001").ok).toBe(false);
    expect(parseQuantity("x").ok).toBe(false);
  });
});

describe("formato argentino", () => {
  it("formatMoney", () => {
    expect(formatMoney(123456)).toBe("$ 1.234,56");
    expect(formatMoney(5)).toBe("$ 0,05");
    expect(formatMoney(0)).toBe("$ 0,00");
    expect(formatMoney(-150)).toBe("$ -1,50");
    expect(formatMoney(MAX_AMOUNT_CENTS)).toBe("$ 1.000.000.000.000,00");
  });
  it("formatQuantity saca los ceros sobrantes", () => {
    expect(formatQuantity(150)).toBe("1,5");
    expect(formatQuantity(200)).toBe("2");
    expect(formatQuantity(125)).toBe("1,25");
    expect(formatDecimal(100000, 2, false)).toBe("1.000");
  });
  it("para volver a un campo, sin puntos de miles (y se lee igual)", () => {
    expect(centsToInput(123456)).toBe("1234,56");
    expect(quantityToInput(150000)).toBe("1500");
    expect(parseMoney(centsToInput(987654321))).toEqual({ ok: true, value: 987654321 });
  });
});
