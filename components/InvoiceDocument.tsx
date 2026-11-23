import { CONDITION_LABEL, IVA_RATE_LABEL, effectiveRate, formatInvoiceNumber, ivaOf, lineNet, totalRows } from "@/lib/invoice";
import { formatDate } from "@/lib/format";
import { formatMoney, formatQuantity } from "@/lib/money";
import { formatCuit, formatTaxId } from "@/lib/validation";
import type { InvoiceDTO, IssuerProfile } from "@/lib/types";

/**
 * La factura en pantalla, con la misma disposición que el PDF: letra al
 * centro, emisor a la izquierda, número y fechas a la derecha. Un borrador
 * se ve sobre papel amarillo (la hoja "duplicado" del talonario) y con los
 * datos actuales del emisor, porque todavía no se copiaron.
 */
export default function InvoiceDocument({ invoice, profile }: { invoice: InvoiceDTO; profile: IssuerProfile }) {
  const draft = invoice.status === "draft";
  const issuer = invoice.issuer ?? profile;
  const type = invoice.type;

  return (
    <article
      aria-label="Factura"
      className={`relative overflow-hidden rounded-lg border border-line p-4 sm:p-6 ${draft ? "bg-duplicado/50" : "bg-white"}`}
    >
      {invoice.status === "cancelled" && (
        <p aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="display -rotate-12 rounded border-4 border-sello/60 px-6 py-2 text-6xl text-sello/50">ANULADA</span>
        </p>
      )}
      <header className="grid gap-4 border-b border-line pb-4 sm:grid-cols-[1fr_auto_1fr]">
        <div>
          <p className="text-lg font-bold">{issuer.businessName || <span className="text-muted">Tu razón social</span>}</p>
          <p className="text-sm text-muted">{issuer.address || "Domicilio"}</p>
          <p className="text-sm font-semibold">{issuer.ivaCondition ? CONDITION_LABEL[issuer.ivaCondition] : "Condición de IVA"}</p>
        </div>
        <div className="order-first flex flex-col items-center sm:order-none">
          <span className="display flex h-14 w-14 items-center justify-center rounded border-2 border-tinta bg-white text-4xl">{type}</span>
          <span className="mt-1 text-[10px] text-muted">COD. {type === "A" ? "01" : type === "B" ? "06" : "11"}</span>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm sm:justify-self-end">
          <dt className="col-span-2 display text-2xl">FACTURA</dt>
          <dt className="text-muted">Número</dt>
          <dd className="tabular font-semibold">{draft ? "Se asigna al emitir" : formatInvoiceNumber(invoice.pointOfSale, invoice.number)}</dd>
          <dt className="text-muted">Emisión</dt>
          <dd className="tabular font-semibold">{draft ? "Al emitir" : formatDate(invoice.issueDate)}</dd>
          <dt className="text-muted">CUIT</dt>
          <dd className="tabular font-semibold">{issuer.cuit ? formatCuit(issuer.cuit) : "—"}</dd>
        </dl>
      </header>

      <section className="grid gap-x-6 gap-y-1 border-b border-line py-4 text-sm sm:grid-cols-2">
        <p><span className="text-muted">Cliente: </span><strong>{invoice.client.name}</strong></p>
        <p><span className="text-muted">Condición IVA: </span><strong>{CONDITION_LABEL[invoice.client.ivaCondition]}</strong></p>
        <p><span className="text-muted">Domicilio: </span>{invoice.client.address || "—"}</p>
        <p><span className="text-muted">Documento: </span><span className="tabular">{formatTaxId(invoice.client.taxId) || "—"}</span></p>
        <p><span className="text-muted">Vencimiento: </span><strong className="tabular">{formatDate(invoice.dueDate)}</strong></p>
      </section>

      <div className="overflow-x-auto">
        <table className="mt-2 w-full min-w-[32rem] text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="py-2 pr-3 font-semibold">Descripción</th>
              <th className="py-2 pr-3 text-right font-semibold">Cant.</th>
              <th className="py-2 pr-3 text-right font-semibold">{type === "B" ? "Precio c/IVA" : "Precio unit."}</th>
              {type === "A" && <th className="py-2 pr-3 text-right font-semibold">IVA</th>}
              <th className="py-2 text-right font-semibold">{type === "B" ? "Subtotal c/IVA" : "Subtotal"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {invoice.lines.map((line, i) => {
              const rate = effectiveRate(type, line.ivaRate);
              const net = lineNet(line);
              const unit = type === "B" ? line.unitPriceCents + ivaOf(line.unitPriceCents, rate) : line.unitPriceCents;
              const subtotal = type === "B" ? net + ivaOf(net, rate) : net;
              return (
                <tr key={i}>
                  <td className="py-2 pr-3">{line.description}</td>
                  <td className="tabular py-2 pr-3 text-right">{formatQuantity(line.quantity)}</td>
                  <td className="tabular py-2 pr-3 text-right">{formatMoney(unit)}</td>
                  {type === "A" && <td className="tabular py-2 pr-3 text-right">{IVA_RATE_LABEL[line.ivaRate]}</td>}
                  <td className="tabular py-2 text-right">{formatMoney(subtotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <dl className="ml-auto mt-4 max-w-xs space-y-1 text-sm">
        {totalRows(type, invoice.totals).map(([name, cents], i, rows) => (
          <div key={name} className={`flex justify-between gap-4 ${i === rows.length - 1 ? "border-t border-line pt-2 text-lg font-bold" : "text-muted"}`}>
            <dt>{name}</dt>
            <dd className="tabular text-tinta">{formatMoney(cents)}</dd>
          </div>
        ))}
      </dl>
      {type === "B" && (
        <p className="mt-3 text-xs text-muted">
          Régimen de Transparencia Fiscal al Consumidor (Ley 27.743): IVA contenido{" "}
          <span className="tabular">{formatMoney(invoice.totals.ivaCents)}</span>.
        </p>
      )}
      {invoice.notes && (
        <p className="mt-4 whitespace-pre-line border-t border-line pt-3 text-sm">
          <span className="font-semibold">Observaciones: </span>
          {invoice.notes}
        </p>
      )}
    </article>
  );
}
