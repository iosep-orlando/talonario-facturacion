import { STATUS_LABEL } from "@/lib/invoice";
import type { InvoiceStatus } from "@/lib/types";

const STYLE: Record<InvoiceStatus, string> = {
  draft: "border-dashed border-muted/60 bg-duplicado/60 text-tinta",
  issued: "border-carbonico/40 text-carbonico",
  paid: "border-pagada/50 bg-pagada/5 text-pagada",
  cancelled: "border-sello/40 text-sello line-through decoration-1",
};

/** El estado de la factura como un sello. "Vencida" reemplaza a "Emitida" si ya pasó el vencimiento. */
export default function StatusBadge({ status, overdue = false }: { status: InvoiceStatus; overdue?: boolean }) {
  const style = overdue ? "border-sello bg-sello text-white" : STYLE[status];
  return (
    <span className={`inline-block whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-xs font-bold ${style}`}>
      {overdue ? "Vencida" : STATUS_LABEL[status]}
    </span>
  );
}
