import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import InvoiceTable from "@/components/InvoiceTable";
import MonthlyChart from "@/components/MonthlyChart";
import { button, linkButton, pageTitle, panel } from "@/components/ui";
import { daysBetween, monthLong, plural, todayAR } from "@/lib/format";
import { formatInvoiceNumber } from "@/lib/invoice";
import { formatMoney } from "@/lib/money";
import { pageUser } from "@/lib/page-auth";
import { userMetrics } from "@/lib/store/metrics";
import { loadMe } from "@/lib/store/profile";

export const metadata: Metadata = { title: "Resumen" };

export default function PanelPage() {
  return (
    <main>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className={pageTitle}>Resumen</h1>
        <Link href="/panel/facturas/nueva" className={button}>Nueva factura</Link>
      </div>
      <Suspense fallback={<p className="mt-6 text-muted">Calculando…</p>}>
        <Summary />
      </Suspense>
    </main>
  );
}

// Server Component: lee MongoDB directamente, sin pasar por la API.
async function Summary() {
  const caller = await pageUser();
  const today = todayAR();
  const [m, me] = await Promise.all([userMetrics(caller.userId, today), loadMe(caller.userId)]);
  const month = monthLong(m.month).replace(/ de \d{4}$/, "");
  const empty = m.clients === 0 && m.recent.length === 0 && m.drafts === 0;

  return (
    <div className="mt-6 space-y-6">
      {me && !me.profileComplete && (
        <p className="rounded-lg border border-carbonico/30 bg-white p-4">
          <strong>Antes de emitir tu primera factura</strong>, completá tus datos de emisor (razón social, CUIT,
          condición de IVA y domicilio): salen en cada factura.{" "}
          <Link href="/panel/perfil" className={linkButton}>Ir a Perfil</Link>
        </p>
      )}

      {empty ? (
        <section className={`${panel} p-6`}>
          <h2 className="text-lg font-semibold">Primeros pasos</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted">
            <li><Link href="/panel/perfil" className={linkButton}>Cargá tus datos de emisor</Link> y, si querés, tu logo.</li>
            <li><Link href="/panel/clientes" className={linkButton}>Agregá un cliente</Link> con su condición frente al IVA.</li>
            <li><Link href="/panel/facturas/nueva" className={linkButton}>Armá la factura</Link>, emitila y mandala por mail.</li>
          </ol>
        </section>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={`Facturado en ${month}`} value={formatMoney(m.billedThisMonth.cents)} note={plural(m.billedThisMonth.count, "factura", "facturas")} />
            <Stat label={`Cobrado en ${month}`} value={formatMoney(m.collectedThisMonth.cents)} note={plural(m.collectedThisMonth.count, "factura", "facturas")} />
            <Stat label="Pendiente de cobro" value={formatMoney(m.pending.cents)} note={plural(m.pending.count, "factura emitida", "facturas emitidas")} href="/panel/facturas?estado=pending" />
            <Stat
              label="Vencido"
              value={formatMoney(m.overdue.cents)}
              note={m.overdue.count === 0 ? "nada vencido" : plural(m.overdue.count, "factura", "facturas")}
              alert={m.overdue.count > 0}
              href="/panel/facturas?estado=overdue"
            />
          </dl>

          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <section className={`${panel} p-5`}>
              <h2 className="font-semibold">Facturado por mes</h2>
              <p className="text-sm text-muted">Emitidas y pagadas, por fecha de emisión. Las anuladas no cuentan.</p>
              <div className="mt-4">
                <MonthlyChart data={m.byMonth} />
              </div>
            </section>

            <section className={`${panel} p-5`}>
              <h2 className="font-semibold">Vencidas</h2>
              {m.overdue.list.length === 0 ? (
                <p className="mt-2 text-muted">No hay facturas vencidas sin cobrar.</p>
              ) : (
                <ul className="mt-2 divide-y divide-line">
                  {m.overdue.list.map((inv) => (
                    <li key={inv.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
                      <Link href={`/panel/facturas/${inv.id}`} className="min-w-0 hover:underline">
                        <span className="font-semibold">{inv.clientName}</span>{" "}
                        <span className="tabular text-sm text-muted">{inv.type} {formatInvoiceNumber(inv.pointOfSale, inv.number)}</span>
                      </Link>
                      <span className="tabular text-sm">
                        <strong>{formatMoney(inv.totalCents)}</strong>{" "}
                        <span className="text-sello">hace {plural(daysBetween(inv.dueDate, today), "día", "días")}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className={`${panel} p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">Últimas facturas</h2>
              <Link href="/panel/facturas" className={`${linkButton} text-sm`}>Ver todas</Link>
            </div>
            {m.recent.length === 0 ? (
              <p className="mt-3 text-muted">
                Todavía no emitiste ninguna.{m.drafts > 0 && ` Tenés ${plural(m.drafts, "borrador", "borradores")} en Facturas.`}
              </p>
            ) : (
              <div className="mt-3"><InvoiceTable invoices={m.recent} /></div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, note, alert = false, href }: { label: string; value: string; note: string; alert?: boolean; href?: string }) {
  return (
    <div className={`${panel} relative p-4 ${href ? "hover:border-tinta/30" : ""}`}>
      <dt className="text-sm text-muted">
        {/* El enlace cubre toda la tarjeta (after:inset-0). */}
        {href ? <Link href={href} className="after:absolute after:inset-0">{label}</Link> : label}
      </dt>
      <dd className={`tabular mt-1 text-2xl font-bold ${alert ? "text-sello" : ""}`}>{value}</dd>
      <dd className="mt-1 text-xs text-muted">{note}</dd>
    </div>
  );
}
