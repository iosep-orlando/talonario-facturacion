// El logo del emisor: PNG o JPG (lo que el PDF puede incrustar), hasta 1 MB.
// El tipo se reconoce por los primeros bytes del archivo, no por el nombre
// ni por lo que diga el navegador.

export const MAX_LOGO_BYTES = 1024 * 1024;

export type LogoType = "image/png" | "image/jpeg";

export function detectImageType(bytes: Uint8Array): LogoType | null {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

export function validateLogo(bytes: Uint8Array): { ok: true; type: LogoType } | { ok: false; error: string } {
  if (bytes.length === 0) return { ok: false, error: "El archivo está vacío." };
  if (bytes.length > MAX_LOGO_BYTES) return { ok: false, error: "El logo puede pesar hasta 1 MB." };
  const type = detectImageType(bytes);
  if (!type) return { ok: false, error: "El logo tiene que ser una imagen PNG o JPG." };
  return { ok: true, type };
}
