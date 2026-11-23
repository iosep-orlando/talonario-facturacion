"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useMemo, useState, type FormEvent } from "react";
import { useGlobal } from "@/lib/context/GlobalContext";
import { api, errorMessage } from "@/lib/fetcher";
import { addDays, todayAR } from "@/lib/format";
import {
  CONDITION_LABEL,
  IVA_RATES,
  IVA_RATE_LABEL,
  computeTotals,
  effectiveRate,
  invoiceType,
  ivaOf,
  lineNet,
  totalRows,
} from "@/lib/invoice";
import { centsToInput, formatMoney, parseMoney, parseQuantity, quantityToInput } from "@/lib/money";
import type { ClientDTO, InvoiceDTO, InvoiceLine, IvaRate } from "@/lib/types";
import FormError from "./FormError";
import { button, buttonSecondary, hint, input, label, linkButton, panel } from "./ui";

// ---------------------------------------------------------------------------
// El formulario de la factura (nueva o borrador). Los importes se escriben
// como texto ("1.234,56") y se convierten a centavos acá mismo, sin pasar
// por números con decimales; el servidor recibe enteros y los vuelve a
// validar. Los totales se calculan con el mismo código que usa el servidor
// (lib/invoice.ts), así que lo que se ve es lo que se emite.
// ---------------------------------------------------------------------------

interface LineDraft {
  key: number;
  description: string;
  quantity: string;
  price: string;
  ivaRate: IvaRate;
}

let nextKey = 1;

function emptyLine(rate: IvaRate): LineDraft {
  return { key: nextKey++, description: "", quantity: "1", price: "", ivaRate: rate };
}

function fromInvoice(line: InvoiceLine): LineDraft {
  return {
    key: nextKey++,
    description: line.description,
    quantity: quantityToInput(line.quantity),
    price: centsToInput(line.unitPriceCents),
    ivaRate: line.ivaRate,
  };
}

function initialState(invoice: InvoiceDTO | null, defaultRate: IvaRate, dueDays: number, clientId: string) {
  return {
    clientId: invoice?.clientId ?? clientId,
    dueDate: invoice?.dueDate ?? addDays(todayAR(), dueDays),
    lines: invoice ? invoice.lines.map(fromInvoice) : [emptyLine(defaultRate)],
    notes: invoice?.notes ?? "",
  };
}

export default function InvoiceEditor({ clients, invoice }: { clients: ClientDTO[]; invoice: InvoiceDTO | null }) {
  const { me } = useGlobal();
  const router = useRouter();
  const { defaultIvaRate, defaultDueDays } = me.preferences;
  const start = () => initialState(invoice, defaultIvaRate, defaultDueDays, clients.length === 1 ? clients[0].id : "");
  const [form, setForm] = useState(start);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  // Next.js 16 esconde la página en vez de cerrarla: al volver, de cero.
  useLayoutEffect(
    () => () => {
      setForm(start());
      setPending(false);
      setError(null);
      setShowErrors(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const client = clients.find((c) => c.id === form.clientId) ?? null;
  const type = invoiceType(me.profile.ivaCondition, client?.ivaCondition ?? "CONSUMIDOR_FINAL");

  const parsed = useMemo(
    () =>
      form.lines.map((line) => {
        const quantity = parseQuantity(line.quantity);
        const price = parseMoney(line.price);
        const value: InvoiceLine | null =
          quantity.ok && price.ok && line.description.trim()
            ? { description: line.description.trim(), quantity: quantity.value, unitPriceCents: price.value, ivaRate: line.ivaRate }
            : null;
        return {
          value,
          errors: {
            description: line.description.trim() ? null : "Falta la descripción.",
            quantity: quantity.ok ? null : quantity.error,
            price: price.ok ? null : price.error,
          },
        };
      }),
    [form.lines],
  );
  const valid = parsed.map((p) => p.value).filter((v): v is InvoiceLine => v !== null);
  const totals = computeTotals(valid, type);

  /** Cualquier cambio borra el aviso de error: ya no se refiere a lo que está escrito. */
  function change(update: (f: ReturnType<typeof start>) => ReturnType<typeof start>) {
    setError(null);
    setForm(update);
  }

  function setLine(key: number, patch: Partial<LineDraft>) {
    change((f) => ({ ...f, lines: f.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setShowErrors(true);
    setError(null);
    if (!form.clientId) return setError("Elegí un cliente.");
    if (valid.length !== form.lines.length) return setError("Revisá las líneas marcadas en rojo.");
    setPending(true);
    try {
      const body = { clientId: form.clientId, dueDate: form.dueDate, lines: valid, notes: form.notes };
      const saved = invoice
        ? await api<InvoiceDTO>(`/api/invoices/${invoice.id}`, { method: "PUT", json: body })
        : await api<InvoiceDTO>("/api/invoices", { method: "POST", json: body });
      router.push(`/panel/facturas/${saved.id}`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  if (clients.length === 0) {
    return (
      <div className={`${panel} mt-6 p-6`}>
        <p>Para facturar necesitás al menos un cliente.</p>
        <Link href="/panel/clientes?nuevo=1" className={`${button} mt-4`}>Agregar un cliente</Link>
      </div>
    );
  }

  const lineSubtotal = (line: InvoiceLine) => {
    const net = lineNet(line);
    return type === "B" ? net + ivaOf(net, effectiveRate(type, line.ivaRate)) : net;
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-6" noValidate>
      <section className={`${panel} grid gap-4 p-5 sm:grid-cols-[1fr_12rem]`}>
        <div>
          <label htmlFor="client" className={label}>Cliente</label>
          <select id="client" value={form.clientId} onChange={(e) => change((f) => ({ ...f, clientId: e.target.value }))} className={input}>
            <option value="">Elegí un cliente…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({CONDITION_LABEL[c.ivaCondition]})
              </option>
            ))}
          </select>
          <p className={hint}>
            ¿No está? <Link href="/panel/clientes?nuevo=1" className={linkButton}>Agregalo en Clientes</Link>.
          </p>
        </div>
        <div>
          <label htmlFor="due" className={label}>Vencimiento</label>
          <input id="due" type="date" required value={form.dueDate} onChange={(e) => change((f) => ({ ...f, dueDate: e.target.value }))} className={`${input} tabular`} />
        </div>
        <p className="rounded-md bg-papel px-3 py-2 text-sm sm:col-span-2" aria-live="polite">
          <strong>Factura {type}</strong>
          {": "}
          {type === "A" && "sos responsable inscripto y el cliente también puede usar el IVA: precios sin IVA, con el IVA discriminado."}
          {type === "B" && "sos responsable inscripto y el cliente es consumidor final o exento: la factura muestra precios con IVA incluido."}
          {type === "C" && (me.profile.ivaCondition ? "como monotributista o exento no cobrás IVA: los precios van sin IVA." : "todavía no cargaste tu condición de IVA en Perfil; por ahora se arma como C.")}
        </p>
      </section>

      <section className={`${panel} p-5`}>
        <h2 className="font-semibold">Detalle</h2>
        <p className="text-sm text-muted">Precios unitarios sin IVA. Podés escribir «1.500», «1500,50» o «1500.50».</p>
        <div className="mt-4 space-y-3">
          {form.lines.map((line, index) => {
            const p = parsed[index];
            const err = (field: "description" | "quantity" | "price") => (showErrors ? p.errors[field] : null);
            return (
              <fieldset key={line.key} className="grid grid-cols-2 gap-2 border-b border-line pb-3 sm:grid-cols-[1fr_5.5rem_8.5rem_6.5rem_7.5rem_2rem] sm:items-start">
                <legend className="sr-only">Línea {index + 1}</legend>
                <div className="col-span-2 sm:col-span-1">
                  <label htmlFor={`d${line.key}`} className={index === 0 ? label : "sr-only"}>Descripción</label>
                  <input id={`d${line.key}`} value={line.description} onChange={(e) => setLine(line.key, { description: e.target.value })} maxLength={200} aria-invalid={Boolean(err("description"))} className={`${input} ${err("description") ? "border-sello" : ""}`} />
                </div>
                <div>
                  <label htmlFor={`q${line.key}`} className={index === 0 ? label : "sr-only"}>Cantidad</label>
                  <input id={`q${line.key}`} inputMode="decimal" value={line.quantity} onChange={(e) => setLine(line.key, { quantity: e.target.value })} aria-invalid={Boolean(err("quantity"))} className={`${input} tabular text-right ${err("quantity") ? "border-sello" : ""}`} />
                </div>
                <div>
                  <label htmlFor={`p${line.key}`} className={index === 0 ? label : "sr-only"}>Precio unit.</label>
                  <input id={`p${line.key}`} inputMode="decimal" placeholder="0,00" value={line.price} onChange={(e) => setLine(line.key, { price: e.target.value })} aria-invalid={Boolean(err("price"))} className={`${input} tabular text-right ${err("price") ? "border-sello" : ""}`} />
                </div>
                <div>
                  <label htmlFor={`i${line.key}`} className={index === 0 ? label : "sr-only"}>IVA</label>
                  {type === "C" ? (
                    <input id={`i${line.key}`} disabled value="Sin IVA" className={input} />
                  ) : (
                    <select id={`i${line.key}`} value={line.ivaRate} onChange={(e) => setLine(line.key, { ivaRate: Number(e.target.value) as IvaRate })} className={input}>
                      {IVA_RATES.map((r) => <option key={r} value={r}>{IVA_RATE_LABEL[r]}</option>)}
                    </select>
                  )}
                </div>
                <div className="text-right">
                  <span className={index === 0 ? `${label} text-right` : "sr-only"}>{type === "B" ? "Con IVA" : "Subtotal"}</span>
                  <span className="tabular block py-2 font-semibold">{p.value ? formatMoney(lineSubtotal(p.value)) : "—"}</span>
                </div>
                <div className={index === 0 ? "sm:pt-6" : ""}>
                  <button
                    type="button"
                    onClick={() => change((f) => ({ ...f, lines: f.lines.filter((l) => l.key !== line.key) }))}
                    disabled={form.lines.length === 1}
                    aria-label={`Quitar la línea ${index + 1}`}
                    className="rounded-md px-2 py-2 text-muted hover:bg-papel hover:text-sello disabled:invisible"
                  >
                    ✕
                  </button>
                </div>
                {showErrors && (p.errors.description || p.errors.quantity || p.errors.price) && (
                  <p className="col-span-2 text-sm text-sello sm:col-span-6">
                    {[p.errors.description, p.errors.quantity && `Cantidad: ${p.errors.quantity}`, p.errors.price && `Precio: ${p.errors.price}`].filter(Boolean).join(" ")}
                  </p>
                )}
              </fieldset>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => change((f) => ({ ...f, lines: [...f.lines, emptyLine(defaultIvaRate)] }))}
          disabled={form.lines.length >= 50}
          className={`${buttonSecondary} mt-3`}
        >
          Agregar línea
        </button>

        <dl className="ml-auto mt-6 max-w-sm space-y-1 text-sm">
          {totalRows(type, totals).map(([name, cents], i, rows) => (
            <div key={name} className={`flex justify-between gap-4 ${i === rows.length - 1 ? "border-t border-line pt-2 text-lg font-bold" : "text-muted"}`}>
              <dt>{name}</dt>
              <dd className="tabular text-tinta">{formatMoney(cents)}</dd>
            </div>
          ))}
          {type === "B" && (
            <div className="flex justify-between gap-4 text-xs text-muted">
              <dt>IVA contenido (Ley 27.743)</dt>
              <dd className="tabular">{formatMoney(totals.ivaCents)}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className={`${panel} p-5`}>
        <label htmlFor="notes" className={label}>Observaciones (opcional)</label>
        <textarea id="notes" rows={3} maxLength={1000} value={form.notes} onChange={(e) => change((f) => ({ ...f, notes: e.target.value }))} placeholder="Por ejemplo, el CBU para la transferencia." className={input} />
      </section>

      <FormError message={error} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={button}>
          {pending ? "Guardando…" : "Guardar borrador"}
        </button>
        <Link href={invoice ? `/panel/facturas/${invoice.id}` : "/panel/facturas"} className={buttonSecondary}>Cancelar</Link>
        <p className="text-sm text-muted">Después de guardar la revisás y la emitís: recién ahí recibe número.</p>
      </div>
    </form>
  );
}
