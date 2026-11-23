import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import InvoiceTable from "@/components/InvoiceTable";
import { button, pageTitle, panel } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { pageUser } from "@/lib/page-auth";
import { listInvoices, type InvoiceFilter } from "@/lib/store/invoices";

export const metadata: Metadata = { title: "Facturas" };

const FILTERS: { value: InvoiceFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "draft", label: "Borradores" },
  { value: "pending", label: "Por cobrar" },
  { value: "overdue", label: "Vencidas" },
  { value: "paid", label: "Pagadas" },
  { value: "cancelled", label: "Anuladas" },
];

export default function InvoicesPage({ searchParams }: PageProps<"/panel/facturas">) {
  return (
    <main>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className={pageTitle}>Facturas</h1>
        <Link href="/panel/facturas/nueva" className={button}>Nueva factura</Link>
      </div>
      <Suspense fallback={<p className="mt-6 text-muted">Cargando…</p>}>
        <InvoiceList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

// Server Component: lee MongoDB directamente. El filtro va en la URL
// (?estado=), así que cada pestaña se puede guardar o compartir.
async function InvoiceList({ searchParams }: { searchParams: PageProps<"/panel/facturas">["searchParams"] }) {
  const caller = await pageUser();
  const raw = (await searchParams).estado;
  const filter = FILTERS.find((f) => f.value === raw)?.value ?? "all";
  const invoices = await listInvoices(caller.userId, filter);
  const total = invoices.filter((i) => i.status !== "cancelled" && i.status !== "draft").reduce((sum, i) => sum + i.totalCents, 0);

  return (
    <div className="mt-6 space-y-4">
      <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value === "all" ? "/panel/facturas" : `/panel/facturas?estado=${f.value}`}
            aria-current={f.value === filter ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-sm font-semibold ${
              f.value === filter ? "border-tinta bg-tinta text-white" : "border-line bg-white hover:border-tinta/40"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      <section className={`${panel} p-5`}>
        {invoices.length === 0 ? (
          <p className="text-muted">
            {filter === "all" ? (
              <>Todavía no hay facturas. <Link href="/panel/facturas/nueva" className="font-semibold text-carbonico hover:underline">Armá la primera</Link>.</>
            ) : (
              "No hay facturas en este estado."
            )}
          </p>
        ) : (
          <>
            <InvoiceTable invoices={invoices} />
            {total > 0 && (
              <p className="mt-3 text-right text-sm text-muted">
                Suma de las emitidas de la lista: <strong className="tabular text-tinta">{formatMoney(total)}</strong>
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
