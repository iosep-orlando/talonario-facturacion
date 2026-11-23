import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { duplicateInvoice } from "@/lib/store/invoices";

/** Un borrador nuevo con el mismo cliente y las mismas líneas. */
export const POST = handle(async (_request: Request, ctx: RouteContext<"/api/invoices/[id]/duplicate">) => {
  const caller = await requireUser();
  return Response.json(await duplicateInvoice(caller.userId, (await ctx.params).id), { status: 201 });
});
