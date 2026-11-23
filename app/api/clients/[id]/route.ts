import { requireUser } from "@/lib/auth";
import { ApiError, handle, readJson } from "@/lib/api";
import { clientToDTO } from "@/lib/db";
import { deleteClient, getClientOr404, updateClient } from "@/lib/store/clients";
import { validateClient } from "@/lib/validation";

type Ctx = RouteContext<"/api/clients/[id]">;

export const GET = handle(async (_request: Request, ctx: Ctx) => {
  const caller = await requireUser();
  return Response.json(clientToDTO(await getClientOr404(caller.userId, (await ctx.params).id)));
});

export const PUT = handle(async (request: Request, ctx: Ctx) => {
  const caller = await requireUser();
  const input = validateClient(await readJson(request));
  if (!input.ok) throw new ApiError(400, input.error);
  return Response.json(await updateClient(caller.userId, (await ctx.params).id, input.value));
});

export const DELETE = handle(async (_request: Request, ctx: Ctx) => {
  const caller = await requireUser();
  await deleteClient(caller.userId, (await ctx.params).id);
  return new Response(null, { status: 204 });
});
