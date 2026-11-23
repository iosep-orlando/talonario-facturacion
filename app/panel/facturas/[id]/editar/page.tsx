import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import InvoiceEditor from "@/components/InvoiceEditor";
import { linkButton, pageTitle } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { pageUser } from "@/lib/page-auth";
import { listClients } from "@/lib/store/clients";
import { getInvoice } from "@/lib/store/invoices";

export const metadata: Metadata = { title: "Editar borrador" };

export default function EditInvoicePage({ params }: PageProps<"/panel/facturas/[id]/editar">) {
  return (
    <main>
      <Suspense fallback={<p className="text-muted">Cargando…</p>}>
        <Editor params={params} />
      </Suspense>
    </main>
  );
}

async function Editor({ params }: { params: PageProps<"/panel/facturas/[id]/editar">["params"] }) {
  const caller = await pageUser();
  const { id } = await params;
  const invoice = await getInvoice(caller.userId, id).catch((error) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
  // Una emitida ya no se edita: se ve.
  if (invoice.status !== "draft") redirect(`/panel/facturas/${id}`);
  const clients = await listClients(caller.userId);
  return (
    <>
      <Link href={`/panel/facturas/${id}`} className={`${linkButton} text-sm`}>← Volver al borrador</Link>
      <h1 className={`${pageTitle} mt-2`}>Editar borrador</h1>
      {/* key: si el borrador cambió desde la última vez, el formulario arranca con lo nuevo. */}
      <InvoiceEditor key={invoice.updatedAt} clients={clients} invoice={invoice} />
    </>
  );
}
