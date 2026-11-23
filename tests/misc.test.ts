import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { escapeHtml } from "@/lib/html";
import { SESSION_COOKIE, getSecret, signSession, verifySession } from "@/lib/jwt";
import { MAX_LOGO_BYTES, detectImageType, validateLogo } from "@/lib/logo";
import { fromAddress, isOutbox, smtpConfig } from "@/lib/mail";
import { safeNext } from "@/lib/next-url";
import { proxy } from "@/proxy";

describe("logo", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  it("reconoce el tipo por los bytes, no por el nombre", () => {
    expect(detectImageType(png)).toBe("image/png");
    expect(detectImageType(jpg)).toBe("image/jpeg");
    expect(detectImageType(new TextEncoder().encode("<svg>"))).toBeNull();
  });
  it("valida", () => {
    expect(validateLogo(png)).toEqual({ ok: true, type: "image/png" });
    expect(validateLogo(new Uint8Array())).toEqual({ ok: false, error: "El archivo está vacío." });
    expect(validateLogo(new Uint8Array(MAX_LOGO_BYTES + 1))).toEqual({ ok: false, error: "El logo puede pesar hasta 1 MB." });
    expect(validateLogo(new Uint8Array([1, 2, 3]))).toEqual({ ok: false, error: "El logo tiene que ser una imagen PNG o JPG." });
  });
});

describe("correo", () => {
  it("MailHog por defecto, con las variables del enunciado", () => {
    expect(smtpConfig({})).toEqual({ host: "localhost", port: 1025, secure: false, auth: undefined });
    expect(smtpConfig({ MAILHOG_HOST: "mailhog", MAILHOG_PORT: "2525" })).toMatchObject({ host: "mailhog", port: 2525 });
  });
  it("un SMTP real manda sobre MailHog", () => {
    expect(smtpConfig({ SMTP_HOST: "smtp.x.com", SMTP_PORT: "465", SMTP_USER: "u", SMTP_PASS: "p", MAILHOG_HOST: "m" })).toEqual({
      host: "smtp.x.com",
      port: 465,
      secure: true,
      auth: { user: "u", pass: "p" },
    });
  });
  it("remitente con el nombre de quien factura", () => {
    expect(fromAddress("Tostadero \"La\" Esquina", {})).toBe('"Tostadero La Esquina" <no-responder@talonario.local>');
    expect(fromAddress(undefined, { MAIL_FROM: "a@b.co" })).toBe('"Talonario" <a@b.co>');
    expect(fromAddress("", {})).toBe('"Talonario" <no-responder@talonario.local>');
  });
  it("bandeja de demo", () => {
    expect(isOutbox({ MAIL_TRANSPORT: "outbox" })).toBe(true);
    expect(isOutbox({})).toBe(false);
  });
});

describe("sesión (JWT)", () => {
  it("firma y verifica", async () => {
    const jwt = await signSession({ sub: "u1", email: "a@b.co" });
    expect(await verifySession(jwt)).toEqual({ sub: "u1", email: "a@b.co" });
  });
  it("rechaza un JWT alterado o basura", async () => {
    const jwt = await signSession({ sub: "u1", email: "a@b.co" });
    expect(await verifySession(jwt.slice(0, -2) + "xx")).toBeNull();
    expect(await verifySession("basura")).toBeNull();
  });
  it("secreto: fijo en desarrollo, obligatorio en producción", () => {
    expect(getSecret({ NODE_ENV: "development" }).length).toBeGreaterThan(20);
    expect(() => getSecret({ NODE_ENV: "production" })).toThrow("JWT_SECRET");
    expect(new TextDecoder().decode(getSecret({ JWT_SECRET: "abc", NODE_ENV: "production" }))).toBe("abc");
  });
});

describe("proxy.ts", () => {
  const request = (path: string, cookie?: string) =>
    new NextRequest(new URL(path, "http://localhost:3000"), { headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {} });
  const location = (r: Response) => r.headers.get("location");

  it("sin sesión, el panel manda al login y recuerda adónde iba", async () => {
    const r = await proxy(request("/panel/facturas?estado=overdue"));
    expect(location(r)).toBe("http://localhost:3000/login?next=%2Fpanel%2Ffacturas%3Festado%3Doverdue");
  });
  it("con sesión, el login manda al panel", async () => {
    const jwt = await signSession({ sub: "u1", email: "a@b.co" });
    expect(location(await proxy(request("/login", jwt)))).toBe("http://localhost:3000/panel");
    expect(location(await proxy(request("/panel", jwt)))).toBeNull();
  });
  it("sin sesión, el login se muestra", async () => {
    expect(location(await proxy(request("/login")))).toBeNull();
  });
  it("una sesión vencida o alterada se borra", async () => {
    const r = await proxy(request("/panel", "basura"));
    expect(location(r)).toContain("/login");
    expect(r.headers.get("set-cookie")).toContain(`${SESSION_COOKIE}=;`);
  });
});

describe("varios", () => {
  it("después de entrar, solo a páginas del panel", () => {
    expect(safeNext("/panel/facturas/abc")).toBe("/panel/facturas/abc");
    expect(safeNext("/panel?x=1")).toBe("/panel?x=1");
    expect(safeNext("/panelx")).toBe("/panel");
    expect(safeNext("https://malo.test")).toBe("/panel");
    expect(safeNext("//malo.test/panel")).toBe("/panel");
    expect(safeNext(undefined)).toBe("/panel");
  });
  it("escapa HTML", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});
