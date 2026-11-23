import { redirect } from "next/navigation";
import { AuthError, requireUser, type Caller } from "./auth";

/** Para las páginas del servidor: el usuario de la sesión, o al login. */
export async function pageUser(): Promise<Caller> {
  try {
    return await requireUser();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }
}

