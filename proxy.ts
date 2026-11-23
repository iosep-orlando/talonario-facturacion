import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/jwt";

// proxy.ts (el sustituto de middleware.ts en Next.js 16): antes de cada
// página del panel mira la sesión. Sin base de datos, para que sea rápido;
// las páginas y las rutas de la API vuelven a comprobar contra la base.
//
//   /panel/…   con sesión (sin sesión, al login, y después de vuelta acá)
//   /login     sin sesión (con sesión, directo al panel)
//   /          la landing: pública, no pasa por acá
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const jwt = request.cookies.get(SESSION_COOKIE)?.value;
  const session = jwt ? await verifySession(jwt) : null;

  const redirect = (to: string) => {
    const response = NextResponse.redirect(new URL(to, request.url));
    if (jwt && !session) response.cookies.delete(SESSION_COOKIE); // vencida o alterada
    return response;
  };

  if (pathname === "/login") return session ? redirect("/panel") : NextResponse.next();
  if (!session) return redirect(`/login?next=${encodeURIComponent(pathname + search)}`);
  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/panel/:path*", "/panel"],
};
