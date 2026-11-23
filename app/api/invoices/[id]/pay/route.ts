import { requireUser } from "@/lib/auth";
import { handle, readJson } from "@/lib/api";
import { markPaid } from "@/lib/store/invoices";

/** { paid: true } la marca como pagada; { paid: false } lo deshace. */
export const POST = handle(async (request: Request, ctx: RouteContext<"/api/invoices/[id]/pay">) => {
  const caller = await requireUser();
  const body = await readJson(request);
  return Response.json(await markPaid(caller.userId, (await ctx.params).id, body.paid !== false));
});
