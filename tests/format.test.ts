import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  formatDate,
  formatDateTime,
  isDateString,
  lastMonths,
  monthLong,
  monthShort,
  plural,
  todayAR,
} from "@/lib/format";

describe("fechas en hora argentina", () => {
  it("hoy en Argentina aunque el servidor esté en UTC", () => {
    // 23 nov 01:30 UTC = 22 nov 22:30 en Buenos Aires.
    expect(todayAR(new Date("2026-11-23T01:30:00Z"))).toBe("2026-11-22");
    expect(todayAR(new Date("2026-11-23T03:00:00Z"))).toBe("2026-11-23");
  });
  it("fechas válidas", () => {
    expect(isDateString("2026-02-28")).toBe(true);
    expect(isDateString("2028-02-29")).toBe(true);
    expect(isDateString("2026-02-29")).toBe(false);
    expect(isDateString("2026-13-01")).toBe(false);
    expect(isDateString("26-1-1")).toBe(false);
    expect(isDateString(20261123)).toBe(false);
  });
  it("sumar días cruzando meses y años", () => {
    expect(addDays("2026-12-25", 15)).toBe("2027-01-09");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-11-01", "2026-11-23")).toBe(22);
  });
  it("los últimos meses, del más viejo al actual", () => {
    expect(lastMonths("2026-02-15", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
  it("nombres", () => {
    expect(monthShort("2026-11")).toBe("nov");
    expect(monthShort("2026-13")).toBe("2026-13");
    expect(monthLong("2026-00")).toBe("2026-00 de 2026");
    expect(monthLong("2026-09")).toBe("septiembre de 2026");
    expect(formatDate("2026-11-23")).toBe("23/11/2026");
    expect(formatDate(null)).toBe("—");
    expect(formatDate("ayer")).toBe("—");
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("2026-11-23T00:05:00Z")).toMatch(/22 nov.*21:05/);
    expect(plural(1, "factura", "facturas")).toBe("1 factura");
    expect(plural(1200, "factura", "facturas")).toBe("1.200 facturas");
  });
});
