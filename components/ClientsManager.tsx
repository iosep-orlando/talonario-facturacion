"use client";

import { useCallback, useEffect, useLayoutEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/fetcher";
import { CONDITION_LABEL } from "@/lib/invoice";
import { formatTaxId } from "@/lib/validation";
import type { ClientDTO, IvaCondition } from "@/lib/types";
import FormError from "./FormError";
import { button, buttonDanger, buttonSecondary, hint, input, label, linkButton, panel } from "./ui";

const EMPTY = { name: "", ivaCondition: "CONSUMIDOR_FINAL" as IvaCondition, taxId: "", email: "", address: "" };
const CONDITIONS: IvaCondition[] = ["RI", "MONOTRIBUTO", "EXENTO", "CONSUMIDOR_FINAL"];

/**
 * Los clientes: lista con búsqueda y el formulario para agregar o editar.
 * La primera lista la trae el servidor; después, cada cambio va a la API.
 */
export default function ClientsManager({ initial, openNew }: { initial: ClientDTO[]; openNew: boolean }) {
  const [clients, setClients] = useState(initial);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<ClientDTO | "new" | null>(openNew ? "new" : null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (search: string) => {
    try {
      const data = await api<{ clients: ClientDTO[] }>(`/api/clients?q=${encodeURIComponent(search)}`);
      setClients(data.clients);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, []);

  // Al escribir en la búsqueda (con una pausa corta) y al volver a la pantalla.
  useEffect(() => {
    const timer = setTimeout(() => void load(q), q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  useLayoutEffect(() => () => setEditing(null), []);

  function saved(client: ClientDTO) {
    setEditing(null);
    void load(q);
    return client;
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="q" className="sr-only">Buscar</label>
          <input id="q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, email o CUIT" className={input} />
        </div>
        <button type="button" onClick={() => setEditing("new")} className={button}>Agregar cliente</button>
      </div>

      {editing && (
        <ClientForm
          key={editing === "new" ? "new" : editing.id}
          client={editing === "new" ? null : editing}
          onSaved={saved}
          onCancel={() => setEditing(null)}
          onDeleted={() => {
            setEditing(null);
            void load(q);
          }}
        />
      )}

      <FormError message={loadError} />
      <section className={panel}>
        {clients.length === 0 ? (
          <p className="p-5 text-muted">{q ? "Ningún cliente coincide con la búsqueda." : "Todavía no cargaste clientes."}</p>
        ) : (
          <ul className="divide-y divide-line">
            {clients.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3">
                <div className="min-w-0">
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-sm text-muted">
                    {CONDITION_LABEL[c.ivaCondition]}
                    {c.taxId && <span className="tabular">{`, ${formatTaxId(c.taxId)}`}</span>}
                    {c.email && `, ${c.email}`}
                  </p>
                </div>
                <button type="button" onClick={() => setEditing(c)} className={`${linkButton} text-sm`}>Editar</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ClientForm({
  client,
  onSaved,
  onCancel,
  onDeleted,
}: {
  client: ClientDTO | null;
  onSaved: (client: ClientDTO) => void;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [form, setForm] = useState(client ? { name: client.name, ivaCondition: client.ivaCondition, taxId: client.taxId, email: client.email, address: client.address } : EMPTY);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const needsCuit = form.ivaCondition !== "CONSUMIDOR_FINAL";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = client
        ? await api<ClientDTO>(`/api/clients/${client.id}`, { method: "PUT", json: form })
        : await api<ClientDTO>("/api/clients", { method: "POST", json: form });
      onSaved(result);
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  async function remove() {
    if (!client) return;
    setPending(true);
    setError(null);
    try {
      await api(`/api/clients/${client.id}`, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
      setConfirmDelete(false);
    }
  }

  const set = (field: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <form onSubmit={submit} className={`${panel} grid gap-4 p-5 sm:grid-cols-2`} aria-label={client ? `Editar ${client.name}` : "Cliente nuevo"}>
      <h2 className="font-semibold sm:col-span-2">{client ? `Editar ${client.name}` : "Cliente nuevo"}</h2>
      <div className="sm:col-span-2">
        <label htmlFor="c-name" className={label}>Nombre o razón social</label>
        <input id="c-name" required maxLength={120} value={form.name} onChange={set("name")} className={input} />
      </div>
      <div>
        <label htmlFor="c-cond" className={label}>Condición frente al IVA</label>
        <select id="c-cond" value={form.ivaCondition} onChange={set("ivaCondition")} className={input}>
          {CONDITIONS.map((c) => <option key={c} value={c}>{CONDITION_LABEL[c]}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="c-tax" className={label}>{needsCuit ? "CUIT" : "DNI o CUIT (opcional)"}</label>
        <input id="c-tax" inputMode="numeric" value={form.taxId} onChange={set("taxId")} placeholder={needsCuit ? "30-71234567-1" : "Opcional"} className={`${input} tabular`} />
        <p className={hint}>{needsCuit ? "Se controla el dígito verificador." : "Un consumidor final puede ir sin documento."}</p>
      </div>
      <div>
        <label htmlFor="c-email" className={label}>Email (para mandarle las facturas)</label>
        <input id="c-email" type="email" value={form.email} onChange={set("email")} className={input} />
      </div>
      <div>
        <label htmlFor="c-addr" className={label}>Domicilio</label>
        <input id="c-addr" maxLength={200} value={form.address} onChange={set("address")} className={input} />
      </div>
      <div className="sm:col-span-2"><FormError message={error} /></div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className={button}>{pending ? "Guardando…" : client ? "Guardar cambios" : "Agregar cliente"}</button>
        <button type="button" onClick={onCancel} className={buttonSecondary}>Cancelar</button>
        {client &&
          (confirmDelete ? (
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">¿Borrar este cliente?</span>
              <button type="button" onClick={remove} disabled={pending} className={buttonDanger}>Sí, borrar</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className={buttonSecondary}>No</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className={`${buttonDanger} ml-auto`}>Borrar</button>
          ))}
      </div>
    </form>
  );
}
