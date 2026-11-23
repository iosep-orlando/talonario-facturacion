import { requireUser } from "@/lib/auth";
import { ApiError, handle, readJson } from "@/lib/api";
import { createDraft, listInvoices, type InvoiceFilter } from "@/lib/store/invoices";
import { validateDraft } from "@/lib/validation";

const FILTERS: InvoiceFilter[] = ["all", "draft", "pending", "overdue", "paid", "cancelled"];

export const GET = handle(async (request: Request) => {
  const caller = await requireUser();
  const raw = new URL(request.url).searchParams.get("estado") ?? "all";
  const filter = FILTERS.includes(raw as InvoiceFilter) ? (raw as InvoiceFilter) : "all";
  return Response.json({ invoices: await listInvoices(caller.userId, filter) });
});

/** Un borrador nuevo. Se emite aparte (POST /api/invoices/<id>/issue). */
export const POST = handle(async (request: Request) => {
  const caller = await requireUser();
  const input = validateDraft(await readJson(request));
  if (!input.ok) throw new ApiError(400, input.error);
  return Response.json(await createDraft(caller.userId, input.value), { status: 201 });
});
