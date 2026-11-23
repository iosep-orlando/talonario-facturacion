import { requireUser } from "@/lib/auth";
import { ApiError, handle } from "@/lib/api";
import { collections } from "@/lib/db";
import { MAX_LOGO_BYTES, validateLogo } from "@/lib/logo";
import { STORAGE_DOWN, deleteObject, getObject, logoKey, putObject } from "@/lib/storage";

// El logo del emisor, guardado en el bucket S3 (users/<id>/logo). Sale en
// el PDF de las facturas que se emitan desde ahora.

/** Ver el logo (para la vista previa en Perfil). Solo el propio. */
export const GET = handle(async () => {
  const caller = await requireUser();
  const { users } = await collections();
  const user = await users.findOne({ _id: caller.userId });
  if (!user?.logo) throw new ApiError(404, "Todavía no subiste un logo.");
  let bytes: Uint8Array | null;
  try {
    bytes = await getObject(user.logo.key);
  } catch (error) {
    console.error("Logo", error);
    throw new ApiError(503, STORAGE_DOWN);
  }
  if (!bytes) throw new ApiError(404, "No se encontró el logo.");
  return new Response(Buffer.from(bytes), {
    headers: { "content-type": user.logo.contentType, "cache-control": "private, no-cache" },
  });
});

/** Subir o cambiar el logo: el archivo va como cuerpo de la petición. */
export const PUT = handle(async (request: Request) => {
  const caller = await requireUser();
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_LOGO_BYTES) throw new ApiError(413, "El logo puede pesar hasta 1 MB.");
  const bytes = new Uint8Array(await request.arrayBuffer());
  const valid = validateLogo(bytes);
  if (!valid.ok) throw new ApiError(400, valid.error);
  const key = logoKey(caller.userId.toString());
  try {
    await putObject(key, bytes, valid.type);
  } catch (error) {
    console.error("Logo", error);
    throw new ApiError(503, STORAGE_DOWN);
  }
  const { users } = await collections();
  await users.updateOne(
    { _id: caller.userId },
    { $set: { logo: { key, contentType: valid.type, size: bytes.length, updatedAt: new Date() } } },
  );
  return Response.json({ ok: true });
});

export const DELETE = handle(async () => {
  const caller = await requireUser();
  const { users } = await collections();
  const user = await users.findOne({ _id: caller.userId });
  if (user?.logo) {
    try {
      await deleteObject(user.logo.key);
    } catch (error) {
      console.error("Logo", error); // queda huérfano en el bucket; no impide quitarlo
    }
    await users.updateOne({ _id: caller.userId }, { $set: { logo: null } });
  }
  return Response.json({ ok: true });
});
