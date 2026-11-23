import { requireUser } from "@/lib/auth";
import { ApiError, handle, readJson } from "@/lib/api";
import { getInvoiceDoc, sendInvoice } from "@/lib/store/invoices";
import { validateEmail } from "@/lib/validation";

/** Mandar la factura en PDF por email. { to } opcional: si no, al email del cliente. */
export const POST = handle(async (request: Request, ctx: RouteContext<"/api/invoices/[id]/send">) => {
  const caller = await requireUser();
  const { id } = await ctx.params;
  const body = await readJson(request);
  const invoice = await getInvoiceDoc(caller.userId, id);
  const to = validateEmail(typeof body.to === "string" && body.to.trim() ? body.to : invoice.client.email);
  if (!to.ok) throw new ApiError(400, invoice.client.email ? to.error : "El cliente no tiene email: escribí a quién mandarla.");
  return Response.json(await sendInvoice(caller.userId, id, to.value));
});
