import { requireUser } from "@/lib/auth";
import { ApiError, handle, readJson } from "@/lib/api";
import { deleteDraft, getInvoice, updateDraft } from "@/lib/store/invoices";
import { validateDraft } from "@/lib/validation";

type Ctx = RouteContext<"/api/invoices/[id]">;

export const GET = handle(async (_request: Request, ctx: Ctx) => {
  const caller = await requireUser();
  return Response.json(await getInvoice(caller.userId, (await ctx.params).id));
});

/** Solo un borrador se modifica. */
export const PUT = handle(async (request: Request, ctx: Ctx) => {
  const caller = await requireUser();
  const input = validateDraft(await readJson(request));
  if (!input.ok) throw new ApiError(400, input.error);
  return Response.json(await updateDraft(caller.userId, (await ctx.params).id, input.value));
});

/** Solo un borrador se borra; una emitida se anula. */
export const DELETE = handle(async (_request: Request, ctx: Ctx) => {
  const caller = await requireUser();
  await deleteDraft(caller.userId, (await ctx.params).id);
  return new Response(null, { status: 204 });
});
