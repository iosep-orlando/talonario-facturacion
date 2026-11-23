import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  MAX_LINES,
  digits,
  formatCuit,
  formatTaxId,
  isIvaCondition,
  isValidCuit,
  normalizeEmail,
  validateClient,
  validateDraft,
  validateEmail,
  validateLines,
  validatePreferences,
  validateProfile,
  validateTaxId,
} from "@/lib/validation";

const GOOD_CUIT = "20123456786";

describe("CUIT", () => {
  it("dígito verificador", () => {
    expect(isValidCuit(GOOD_CUIT)).toBe(true);
    expect(isValidCuit("20123456780")).toBe(false);
    expect(isValidCuit("2012345678")).toBe(false);
    expect(isValidCuit("2012345678a")).toBe(false);
  });
  it("cuando el cálculo da 11 el dígito es 0, y 10 nunca es válido", () => {
    // 20-00000001-? : suma = 5*2 + 4*0 + ... + 2*1 = 12 → 11 - 1 = 10 → inválido con cualquier dígito
    for (let d = 0; d <= 9; d++) expect(isValidCuit(`2000000001${d}`)).toBe(false);
    // 20-00000006-? : suma = 10 + 12 = 22 → resto 0 → 11 → dígito 0
    expect(isValidCuit("20000000060")).toBe(true);
  });
  it("formato", () => {
    expect(digits(" 20-12345678-6 ")).toBe(GOOD_CUIT);
    expect(digits("12.345.678")).toBe("12345678");
    expect(formatCuit(GOOD_CUIT)).toBe("20-12345678-6");
    expect(formatCuit("123")).toBe("123");
    expect(formatTaxId(GOOD_CUIT)).toBe("CUIT 20-12345678-6");
    expect(formatTaxId("30123456")).toBe("DNI 30.123.456");
    expect(formatTaxId("")).toBe("");
  });
});

describe("documento según la condición", () => {
  it("inscripto, monotributista y exento: CUIT obligatorio y válido", () => {
    expect(validateTaxId("", "RI")).toEqual({ ok: false, error: "Falta el CUIT." });
    expect(validateTaxId("20-12345678-0", "MONOTRIBUTO").ok).toBe(false);
    expect(validateTaxId("20-12345678-6", "EXENTO")).toEqual({ ok: true, value: GOOD_CUIT });
  });
  it("consumidor final: DNI, CUIT o nada", () => {
    expect(validateTaxId("", "CONSUMIDOR_FINAL")).toEqual({ ok: true, value: "" });
    expect(validateTaxId("30.123.456", "CONSUMIDOR_FINAL")).toEqual({ ok: true, value: "30123456" });
    expect(validateTaxId(GOOD_CUIT, "CONSUMIDOR_FINAL")).toEqual({ ok: true, value: GOOD_CUIT });
    expect(validateTaxId("123", "CONSUMIDOR_FINAL").ok).toBe(false);
  });
});

describe("email", () => {
  it("normaliza y valida", () => {
    expect(normalizeEmail("  Ana@Ejemplo.COM ")).toBe("ana@ejemplo.com");
    expect(validateEmail("ana@ejemplo.com")).toEqual({ ok: true, value: "ana@ejemplo.com" });
    expect(validateEmail("ana@ejemplo").ok).toBe(false);
    expect(validateEmail(42).ok).toBe(false);
    expect(validateEmail(`${"a".repeat(250)}@b.co`).ok).toBe(false);
  });
});

describe("cliente", () => {
  const base = { name: "Ñandú Café", ivaCondition: "RI", taxId: "20-12345678-6", email: "", address: "Thames 1720" };
  it("válido", () => {
    expect(validateClient(base)).toEqual({
      ok: true,
      value: { name: "Ñandú Café", ivaCondition: "RI", taxId: GOOD_CUIT, email: "", address: "Thames 1720" },
    });
  });
  it.each([
    [{ name: "" }, "Falta el nombre o la razón social."],
    [{ name: "x".repeat(121) }, "El nombre puede tener hasta 120 caracteres."],
    [{ ivaCondition: "OTRA" }, "Elegí la condición frente al IVA."],
    [{ taxId: "" }, "Falta el CUIT."],
    [{ email: "no-es-email" }, "Ese email no parece válido."],
    [{ address: "x".repeat(201) }, "El domicilio puede tener hasta 200 caracteres."],
  ])("rechaza %j", (patch, error) => {
    expect(validateClient({ ...base, ...patch })).toEqual({ ok: false, error });
  });
  it("normaliza el email", () => {
    const r = validateClient({ ...base, email: " Compras@Nandu.TEST " });
    expect(r.ok && r.value.email).toBe("compras@nandu.test");
  });
  it("condiciones", () => {
    expect(isIvaCondition("CONSUMIDOR_FINAL")).toBe(true);
    expect(isIvaCondition("consumidor")).toBe(false);
  });
});

describe("perfil del emisor", () => {
  const base = { businessName: "Tostadero", cuit: "20-12345678-6", ivaCondition: "RI", address: "Corrientes 1", pointOfSale: 1, activityStart: "" };
  it("válido", () => {
    expect(validateProfile(base)).toEqual({
      ok: true,
      value: { businessName: "Tostadero", cuit: GOOD_CUIT, ivaCondition: "RI", address: "Corrientes 1", pointOfSale: 1, activityStart: "" },
    });
    expect(validateProfile({ ...base, pointOfSale: "3", activityStart: "2019-03-01" }).ok).toBe(true);
  });
  it.each([
    [{ businessName: " " }, "Falta tu nombre o razón social."],
    [{ businessName: "x".repeat(121) }, "La razón social puede tener hasta 120 caracteres."],
    [{ ivaCondition: "CONSUMIDOR_FINAL" }, "Elegí tu condición frente al IVA."],
    [{ cuit: "20-12345678-0" }, "Ese CUIT no es válido: revisá los 11 números."],
    [{ address: "" }, "Falta el domicilio comercial."],
    [{ address: "x".repeat(201) }, "El domicilio puede tener hasta 200 caracteres."],
    [{ pointOfSale: 0 }, "El punto de venta es un número de 1 a 99999."],
    [{ pointOfSale: 100000 }, "El punto de venta es un número de 1 a 99999."],
    [{ pointOfSale: 1.5 }, "El punto de venta es un número de 1 a 99999."],
    [{ activityStart: "2026-02-30" }, "La fecha de inicio de actividades no es válida."],
  ])("rechaza %j", (patch, error) => {
    expect(validateProfile({ ...base, ...patch })).toEqual({ ok: false, error });
  });
});

describe("preferencias", () => {
  it("valores por defecto válidos", () => {
    expect(validatePreferences({ ...DEFAULT_PREFERENCES })).toEqual({ ok: true, value: DEFAULT_PREFERENCES });
  });
  it("rechaza", () => {
    expect(validatePreferences({ defaultIvaRate: 1900, defaultDueDays: 15 }).ok).toBe(false);
    expect(validatePreferences({ defaultIvaRate: 2100, defaultDueDays: -1 }).ok).toBe(false);
    expect(validatePreferences({ defaultIvaRate: 2100, defaultDueDays: 366 }).ok).toBe(false);
    expect(validatePreferences({ defaultIvaRate: 2100, defaultDueDays: "x" }).ok).toBe(false);
  });
});

describe("líneas y borrador", () => {
  const good = { description: " Café ", quantity: 150, unitPriceCents: 1800000, ivaRate: 2100 };
  it("líneas válidas", () => {
    expect(validateLines([good])).toEqual({ ok: true, value: [{ ...good, description: "Café" }] });
  });
  it.each([
    [[], "La factura necesita al menos una línea."],
    ["x", "La factura necesita al menos una línea."],
    [[{ ...good, description: "" }], "Línea 1: falta la descripción."],
    [[good, { ...good, description: "x".repeat(201) }], "Línea 2: la descripción puede tener hasta 200 caracteres."],
    [[{ ...good, quantity: 0 }], "Línea 1: la cantidad no es válida."],
    [[{ ...good, quantity: 1.5 }], "Línea 1: la cantidad no es válida."],
    [[{ ...good, quantity: "150" }], "Línea 1: la cantidad no es válida."],
    [[{ ...good, unitPriceCents: -1 }], "Línea 1: el precio no es válido."],
    [[{ ...good, unitPriceCents: 10.5 }], "Línea 1: el precio no es válido."],
    [[{ ...good, ivaRate: 1900 }], "Línea 1: elegí la alícuota de IVA."],
    [[{ ...good, quantity: 100_000_000, unitPriceCents: 100_000_000_000 }], "Línea 1: el importe es demasiado grande."],
    [[null], "Línea 1: falta la descripción."],
  ])("rechaza %#", (lines, error) => {
    expect(validateLines(lines)).toEqual({ ok: false, error });
  });
  it(`hasta ${MAX_LINES} líneas`, () => {
    expect(validateLines(Array(MAX_LINES).fill(good)).ok).toBe(true);
    expect(validateLines(Array(MAX_LINES + 1).fill(good)).ok).toBe(false);
  });

  const draft = { clientId: "6560f1a2b3c4d5e6f7a8b9c0", dueDate: "2026-12-01", lines: [good], notes: " CBU " };
  it("borrador válido", () => {
    expect(validateDraft(draft)).toEqual({
      ok: true,
      value: { clientId: draft.clientId, dueDate: "2026-12-01", lines: [{ ...good, description: "Café" }], notes: "CBU" },
    });
  });
  it.each([
    [{ clientId: "nope" }, "Elegí un cliente."],
    [{ dueDate: "01/12/2026" }, "La fecha de vencimiento no es válida."],
    [{ lines: [] }, "La factura necesita al menos una línea."],
    [{ notes: "x".repeat(1001) }, "Las observaciones pueden tener hasta 1000 caracteres."],
  ])("rechaza %j", (patch, error) => {
    expect(validateDraft({ ...draft, ...patch })).toEqual({ ok: false, error });
  });
});
