import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import InvoiceActions from "@/components/InvoiceActions";
import InvoiceDocument from "@/components/InvoiceDocument";
import StatusBadge from "@/components/StatusBadge";
import { linkButton, pageTitle } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { formatDate, formatDateTime, todayAR } from "@/lib/format";
import { invoiceTitle, isOverdue } from "@/lib/invoice";
import { pageUser } from "@/lib/page-auth";
import { getInvoice } from "@/lib/store/invoices";
import { loadMe } from "@/lib/store/profile";

export const metadata: Metadata = { title: "Factura" };

export default function InvoicePage({ params }: PageProps<"/panel/facturas/[id]">) {
  return (
    <main>
      <Link href="/panel/facturas" className={`${linkButton} text-sm`}>← Facturas</Link>
      <Suspense fallback={<p className="mt-6 text-muted">Cargando…</p>}>
        <Invoice params={params} />
      </Suspense>
    </main>
  );
}

// Server Component: lee MongoDB directamente. Las acciones (emitir,
// cobrar, anular, enviar) son de un Client Component que llama a la API.
async function Invoice({ params }: { params: PageProps<"/panel/facturas/[id]">["params"] }) {
  const caller = await pageUser();
  const { id } = await params;
  const [invoice, me] = await Promise.all([
    getInvoice(caller.userId, id).catch((error) => {
      // Ajena o inexistente: la misma respuesta.
      if (error instanceof ApiError && error.status === 404) notFound();
      throw error;
    }),
    loadMe(caller.userId),
  ]);
  if (!me) notFound();
  const overdue = isOverdue(invoice.status, invoice.dueDate, todayAR());

  return (
    <div className="mt-2 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className={`${pageTitle} tabular`}>{invoiceTitle(invoice)}</h1>
        <StatusBadge status={invoice.status} overdue={overdue} />
      </div>
      <p className="text-sm text-muted">
        {invoice.status === "draft" && "Borrador: revisalo y emitilo. Al emitir recibe el próximo número y queda fijo."}
        {invoice.status === "issued" && (overdue ? `Venció el ${formatDate(invoice.dueDate)} y no figura como pagada.` : `Pendiente de cobro: vence el ${formatDate(invoice.dueDate)}.`)}
        {invoice.status === "paid" && `Pagada el ${formatDateTime(invoice.paidAt)}.`}
        {invoice.status === "cancelled" && `Anulada el ${formatDateTime(invoice.cancelledAt)}. Conserva su número.`}
      </p>
      <InvoiceActions key={`${invoice.status}-${invoice.updatedAt}`} invoice={invoice} profileComplete={me.profileComplete} />
      <InvoiceDocument invoice={invoice} profile={me.profile} />
    </div>
  );
}
