import { SignJWT, jwtVerify } from "jose";

// JWT de sesión (HS256). Sin base de datos: lo usa también proxy.ts, que
// corre antes de cada página.

export const SESSION_COOKIE = "session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface SessionPayload {
  sub: string; // id del usuario
  email: string;
}

/**
 * JWT_SECRET firma las sesiones. En desarrollo, si falta, se usa uno fijo
 * (así el .env.local del enunciado funciona tal cual); en producción es
 * obligatorio: con un secreto conocido cualquiera podría fabricarse una sesión.
 */
export function getSecret(env: Record<string, string | undefined> = process.env): Uint8Array {
  const secret = env.JWT_SECRET || (env.NODE_ENV === "production" ? "" : "solo-para-desarrollo-no-usar-en-produccion");
  if (!secret) throw new Error('Falta la variable de entorno "JWT_SECRET"');
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySession(jwt: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(jwt, getSecret(), { algorithms: ["HS256"] });
    const { sub, email } = payload;
    if (typeof sub !== "string" || typeof email !== "string") return null;
    return { sub, email };
  } catch {
    return null;
  }
}
