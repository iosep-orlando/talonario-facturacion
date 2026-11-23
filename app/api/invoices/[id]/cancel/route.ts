import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { cancelInvoice } from "@/lib/store/invoices";

export const POST = handle(async (_request: Request, ctx: RouteContext<"/api/invoices/[id]/cancel">) => {
  const caller = await requireUser();
  return Response.json(await cancelInvoice(caller.userId, (await ctx.params).id));
});
