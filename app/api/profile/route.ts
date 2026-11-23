import { AuthError, requireUser } from "@/lib/auth";
import { ApiError, handle, readJson } from "@/lib/api";
import { collections } from "@/lib/db";
import { loadMe } from "@/lib/store/profile";
import { validatePreferences, validateProfile } from "@/lib/validation";

/**
 * Guardar los datos del emisor y/o las preferencias. Cada parte es
 * opcional: { profile: {…} }, { preferences: {…} } o las dos.
 */
export const PUT = handle(async (request: Request) => {
  const caller = await requireUser();
  const body = await readJson(request);
  const set: Record<string, unknown> = {};
  if (body.profile !== undefined) {
    const profile = validateProfile((body.profile ?? {}) as Record<string, unknown>);
    if (!profile.ok) throw new ApiError(400, profile.error);
    set.profile = profile.value;
  }
  if (body.preferences !== undefined) {
    const preferences = validatePreferences((body.preferences ?? {}) as Record<string, unknown>);
    if (!preferences.ok) throw new ApiError(400, preferences.error);
    set.preferences = preferences.value;
  }
  if (Object.keys(set).length === 0) throw new ApiError(400, "No hay nada para guardar.");
  const { users } = await collections();
  await users.updateOne({ _id: caller.userId }, { $set: set });
  const me = await loadMe(caller.userId);
  if (!me) throw new AuthError();
  return Response.json(me);
});
