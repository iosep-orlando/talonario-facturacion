import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { invoicePdf } from "@/lib/store/invoices";

/** El PDF, desde el bucket S3. ?descargar=1 lo baja en vez de abrirlo. */
export const GET = handle(async (request: Request, ctx: RouteContext<"/api/invoices/[id]/pdf">) => {
  const caller = await requireUser();
  const { bytes, filename } = await invoicePdf(caller.userId, (await ctx.params).id);
  const download = new URL(request.url).searchParams.has("descargar");
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "cache-control": "private, no-cache",
    },
  });
});
