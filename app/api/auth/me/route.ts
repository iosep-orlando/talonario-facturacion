import { AuthError, requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { loadMe } from "@/lib/store/profile";

// Quién soy: lo lee el GlobalContext del panel.
export const GET = handle(async () => {
  const caller = await requireUser();
  const me = await loadMe(caller.userId);
  if (!me) throw new AuthError();
  return Response.json(me);
});
