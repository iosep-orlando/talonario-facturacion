import Link from "next/link";
import { formatInvoiceNumber } from "@/lib/invoice";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { InvoiceSummaryDTO } from "@/lib/types";
import StatusBadge from "./StatusBadge";

/** Tabla de facturas: la usan el resumen y el listado. */
export default function InvoiceTable({ invoices }: { invoices: InvoiceSummaryDTO[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[38rem] text-left text-sm">
        <thead className="border-b border-line text-muted">
          <tr>
            <th className="py-2 pr-3 font-semibold">Factura</th>
            <th className="py-2 pr-3 font-semibold">Cliente</th>
            <th className="py-2 pr-3 font-semibold">Emisión</th>
            <th className="py-2 pr-3 font-semibold">Vence</th>
            <th className="py-2 pr-3 font-semibold">Estado</th>
            <th className="py-2 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {invoices.map((inv) => (
            <tr key={inv.id} className={inv.status === "cancelled" ? "text-muted" : ""}>
              <td className="py-2 pr-3">
                <Link href={`/panel/facturas/${inv.id}`} className="tabular font-semibold hover:underline">
                  <span className="mr-1.5 inline-block w-5 rounded-sm border border-current text-center text-xs">{inv.type}</span>
                  {inv.number === null ? "Borrador" : formatInvoiceNumber(inv.pointOfSale, inv.number)}
                </Link>
              </td>
              <td className="max-w-48 truncate py-2 pr-3">{inv.clientName}</td>
              <td className="tabular py-2 pr-3">{formatDate(inv.issueDate)}</td>
              <td className={`tabular py-2 pr-3 ${inv.overdue ? "font-semibold text-sello" : ""}`}>{formatDate(inv.dueDate)}</td>
              <td className="py-2 pr-3"><StatusBadge status={inv.status} overdue={inv.overdue} /></td>
              <td className="tabular py-2 text-right font-semibold">{formatMoney(inv.totalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
