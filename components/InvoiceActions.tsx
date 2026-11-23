"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import { canCancel, canDelete, canEdit, canIssue, canMarkPaid, canSend, canUnmarkPaid, hasPdf } from "@/lib/invoice";
import type { InvoiceDTO } from "@/lib/types";
import FormError from "./FormError";
import { button, buttonDanger, buttonSecondary, input, label, linkButton, panel } from "./ui";

type Busy = null | "issue" | "delete" | "pay" | "unpay" | "cancel" | "send" | "duplicate";

/**
 * Lo que se puede hacer con la factura según su estado. Las acciones que no
 * tienen vuelta (emitir, anular, borrar) piden confirmación en el mismo
 * botón, sin ventanas emergentes.
 */
export default function InvoiceActions({ invoice, profileComplete }: { invoice: InvoiceDTO; profileComplete: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Busy>(null);
  const [confirming, setConfirming] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [to, setTo] = useState(invoice.client.email);

  // Al volver a la página (Next.js 16 la esconde en vez de cerrarla), de cero.
  useLayoutEffect(
    () => () => {
      setBusy(null);
      setConfirming(null);
      setError(null);
      setNotice(null);
      setSendOpen(false);
    },
    [],
  );

  async function run(kind: Busy, request: () => Promise<unknown>, after?: (result: unknown) => void) {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      const result = await request();
      setConfirming(null);
      if (after) after(result);
      else router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const post = (path: string, json: unknown = {}) => () => api<InvoiceDTO>(`/api/invoices/${invoice.id}${path}`, { method: "POST", json });

  function confirm(kind: Busy, question: string, yes: string, action: () => void, danger = false) {
    if (confirming !== kind) {
      return null;
    }
    return (
      <div role="group" aria-label={question} className="flex w-full flex-wrap items-center gap-2 rounded-md bg-papel p-3">
        <span className="font-semibold">{question}</span>
        <button type="button" onClick={action} disabled={busy !== null} className={danger ? buttonDanger : button}>
          {busy === kind ? "Un momento…" : yes}
        </button>
        <button type="button" onClick={() => setConfirming(null)} className={buttonSecondary}>No</button>
      </div>
    );
  }

  function sendSubmit(event: FormEvent) {
    event.preventDefault();
    void run("send", post("/send", { to }), () => {
      setSendOpen(false);
      setNotice(`Listo: la mandamos a ${to.trim().toLowerCase()}.`);
      router.refresh();
    });
  }

  const status = invoice.status;
  return (
    <section className={`${panel} space-y-3 p-4`} aria-label="Acciones">
      <div className="flex flex-wrap items-center gap-2">
        {canIssue(status) && confirming !== "issue" && (
          <button type="button" onClick={() => setConfirming("issue")} disabled={!profileComplete || busy !== null} className={button}>
            Emitir factura
          </button>
        )}
        {canEdit(status) && <Link href={`/panel/facturas/${invoice.id}/editar`} className={buttonSecondary}>Editar</Link>}
        {hasPdf(status) && (
          <>
            <a href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer" className={button}>Ver PDF</a>
            <a href={`/api/invoices/${invoice.id}/pdf?descargar=1`} className={buttonSecondary}>Descargar</a>
          </>
        )}
        {canSend(status) && (
          <button type="button" onClick={() => setSendOpen((o) => !o)} aria-expanded={sendOpen} className={buttonSecondary}>
            Enviar por email
          </button>
        )}
        {canMarkPaid(status) && (
          <button type="button" onClick={() => run("pay", post("/pay", { paid: true }))} disabled={busy !== null} className={buttonSecondary}>
            {busy === "pay" ? "Marcando…" : "Marcar como pagada"}
          </button>
        )}
        {canUnmarkPaid(status) && (
          <button type="button" onClick={() => run("unpay", post("/pay", { paid: false }))} disabled={busy !== null} className={buttonSecondary}>
            {busy === "unpay" ? "Desmarcando…" : "Desmarcar pagada"}
          </button>
        )}
        <button
          type="button"
          onClick={() => run("duplicate", post("/duplicate"), (r) => router.push(`/panel/facturas/${(r as InvoiceDTO).id}/editar`))}
          disabled={busy !== null}
          className={buttonSecondary}
        >
          {busy === "duplicate" ? "Duplicando…" : "Duplicar"}
        </button>
        <span className="ml-auto flex gap-2">
          {canCancel(status) && confirming !== "cancel" && (
            <button type="button" onClick={() => setConfirming("cancel")} disabled={busy !== null} className={buttonDanger}>Anular</button>
          )}
          {canDelete(status) && confirming !== "delete" && (
            <button type="button" onClick={() => setConfirming("delete")} disabled={busy !== null} className={buttonDanger}>Borrar borrador</button>
          )}
        </span>
      </div>

      {canIssue(status) && !profileComplete && (
        <p className="text-sm">
          Para emitir, primero completá tus datos de emisor en{" "}
          <Link href="/panel/perfil" className={linkButton}>Perfil</Link>.
        </p>
      )}

      {confirm("issue", `¿Emitir la factura ${invoice.type}? Recibe número y ya no se puede editar.`, "Sí, emitir", () =>
        run("issue", post("/issue")),
      )}
      {confirm("cancel", "¿Anular la factura? Conserva el número y el PDF queda marcado como anulado.", "Sí, anular", () => run("cancel", post("/cancel")), true)}
      {confirm(
        "delete",
        "¿Borrar este borrador?",
        "Sí, borrar",
        () =>
          run(
            "delete",
            () => api(`/api/invoices/${invoice.id}`, { method: "DELETE" }),
            () => {
              router.push("/panel/facturas");
              router.refresh();
            },
          ),
        true,
      )}

      {sendOpen && (
        <form onSubmit={sendSubmit} className="flex flex-wrap items-end gap-3 rounded-md bg-papel p-3">
          <div className="min-w-60 flex-1">
            <label htmlFor="send-to" className={label}>Mandar el PDF a</label>
            <input id="send-to" type="email" required value={to} onChange={(e) => setTo(e.target.value)} placeholder="cliente@ejemplo.com" className={input} />
          </div>
          <button type="submit" disabled={busy !== null} className={button}>{busy === "send" ? "Mandando…" : "Enviar"}</button>
        </form>
      )}

      {invoice.lastSentAt && (
        <p className="text-sm text-muted">Última vez enviada a {invoice.lastSentTo} el {formatDateTime(invoice.lastSentAt)}.</p>
      )}
      {notice && <p role="status" className="rounded-md border border-pagada/40 bg-pagada/5 px-3 py-2 text-sm text-pagada">{notice}</p>}
      <FormError message={error} />
    </section>
  );
}
