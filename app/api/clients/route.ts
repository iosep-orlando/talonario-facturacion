import { requireUser } from "@/lib/auth";
import { ApiError, handle, readJson } from "@/lib/api";
import { createClient, listClients } from "@/lib/store/clients";
import { validateClient } from "@/lib/validation";

export const GET = handle(async (request: Request) => {
  const caller = await requireUser();
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json({ clients: await listClients(caller.userId, q) });
});

export const POST = handle(async (request: Request) => {
  const caller = await requireUser();
  const input = validateClient(await readJson(request));
  if (!input.ok) throw new ApiError(400, input.error);
  return Response.json(await createClient(caller.userId, input.value), { status: 201 });
});
