import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { issueInvoice } from "@/lib/store/invoices";

export const POST = handle(async (_request: Request, ctx: RouteContext<"/api/invoices/[id]/issue">) => {
  const caller = await requireUser();
  return Response.json(await issueInvoice(caller.userId, (await ctx.params).id));
});
