import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import InvoiceEditor from "@/components/InvoiceEditor";
import { linkButton, pageTitle } from "@/components/ui";
import { pageUser } from "@/lib/page-auth";
import { listClients } from "@/lib/store/clients";

export const metadata: Metadata = { title: "Nueva factura" };

export default function NewInvoicePage() {
  return (
    <main>
      <Link href="/panel/facturas" className={`${linkButton} text-sm`}>← Facturas</Link>
      <h1 className={`${pageTitle} mt-2`}>Nueva factura</h1>
      <Suspense fallback={<p className="mt-6 text-muted">Cargando…</p>}>
        <Editor />
      </Suspense>
    </main>
  );
}

async function Editor() {
  const caller = await pageUser();
  const clients = await listClients(caller.userId);
  return <InvoiceEditor clients={clients} invoice={null} />;
}
