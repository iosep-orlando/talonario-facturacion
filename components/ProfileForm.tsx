"use client";

import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useGlobal } from "@/lib/context/GlobalContext";
import { api, errorMessage } from "@/lib/fetcher";
import { CONDITION_LABEL, IVA_RATES, IVA_RATE_LABEL } from "@/lib/invoice";
import { MAX_LOGO_BYTES } from "@/lib/logo";
import { formatCuit } from "@/lib/validation";
import type { IssuerCondition, IvaRate, MeDTO } from "@/lib/types";
import FormError from "./FormError";
import { button, buttonDanger, buttonSecondary, hint, input, label, panel } from "./ui";

const ISSUER_CONDITIONS: IssuerCondition[] = ["RI", "MONOTRIBUTO", "EXENTO"];

/** Los datos del emisor, el logo y las preferencias. Al guardar, actualiza el estado global. */
export default function ProfileForm() {
  return (
    <div className="mt-6 space-y-6">
      <IssuerForm />
      <LogoForm />
      <PreferencesForm />
    </div>
  );
}

function Saved({ show }: { show: boolean }) {
  return show ? <span role="status" className="text-sm font-semibold text-pagada">✓ Guardado</span> : null;
}

function IssuerForm() {
  const { me, update } = useGlobal();
  const p = me.profile;
  const initial = () => ({
    businessName: p.businessName,
    cuit: p.cuit ? formatCuit(p.cuit) : "",
    ivaCondition: p.ivaCondition ?? "",
    address: p.address,
    pointOfSale: String(p.pointOfSale || 1),
    activityStart: p.activityStart,
  });
  const [form, setForm] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useLayoutEffect(
    () => () => {
      setSaved(false);
      setError(null);
    },
    [],
  );

  const set = (field: keyof ReturnType<typeof initial>) => (e: { target: { value: string } }) => {
    setSaved(false);
    setForm((f) => ({ ...f, [field]: e.target.value }));
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await api<MeDTO>("/api/profile", { method: "PUT", json: { profile: { ...form, pointOfSale: Number(form.pointOfSale) } } });
      update(result);
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className={`${panel} grid gap-4 p-5 sm:grid-cols-2`} aria-labelledby="issuer-title">
      <div className="sm:col-span-2">
        <h2 id="issuer-title" className="font-semibold">Datos del emisor</h2>
        <p className="text-sm text-muted">Salen en cada factura. Las ya emitidas conservan los datos con que se emitieron.</p>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="p-name" className={label}>Nombre o razón social</label>
        <input id="p-name" required maxLength={120} value={form.businessName} onChange={set("businessName")} className={input} />
      </div>
      <div>
        <label htmlFor="p-cuit" className={label}>CUIT</label>
        <input id="p-cuit" required inputMode="numeric" value={form.cuit} onChange={set("cuit")} placeholder="20-12345678-6" className={`${input} tabular`} />
      </div>
      <div>
        <label htmlFor="p-cond" className={label}>Condición frente al IVA</label>
        <select id="p-cond" required value={form.ivaCondition} onChange={set("ivaCondition")} className={input}>
          <option value="">Elegí…</option>
          {ISSUER_CONDITIONS.map((c) => <option key={c} value={c}>{CONDITION_LABEL[c]}</option>)}
        </select>
        <p className={hint}>Inscripto: facturás A o B. Monotributista o exento: C.</p>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="p-addr" className={label}>Domicilio comercial</label>
        <input id="p-addr" required maxLength={200} value={form.address} onChange={set("address")} className={input} />
      </div>
      <div>
        <label htmlFor="p-pos" className={label}>Punto de venta</label>
        <input id="p-pos" required inputMode="numeric" value={form.pointOfSale} onChange={set("pointOfSale")} className={`${input} tabular`} />
        <p className={hint}>Cada punto de venta y letra tiene su propia numeración.</p>
      </div>
      <div>
        <label htmlFor="p-start" className={label}>Inicio de actividades (opcional)</label>
        <input id="p-start" type="date" value={form.activityStart} onChange={set("activityStart")} className={`${input} tabular`} />
      </div>
      <div className="sm:col-span-2"><FormError message={error} /></div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className={button}>{pending ? "Guardando…" : "Guardar datos"}</button>
        <Saved show={saved} />
      </div>
    </form>
  );
}

function LogoForm() {
  const { me, refresh } = useGlobal();
  const fileRef = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState(() => Date.now());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    if (file.size > MAX_LOGO_BYTES) return setError("El logo puede pesar hasta 1 MB.");
    setPending(true);
    try {
      await api("/api/profile/logo", { method: "PUT", body: file, headers: { "content-type": file.type || "application/octet-stream" } });
      await refresh();
      setVersion(Date.now());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove() {
    setPending(true);
    setError(null);
    try {
      await api("/api/profile/logo", { method: "DELETE" });
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={`${panel} space-y-3 p-5`} aria-labelledby="logo-title">
      <div>
        <h2 id="logo-title" className="font-semibold">Logo</h2>
        <p className="text-sm text-muted">PNG o JPG de hasta 1 MB. Sale arriba a la izquierda en el PDF de las facturas que emitas desde ahora.</p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-20 w-48 items-center justify-center rounded-md border border-dashed border-line bg-papel">
          {me.hasLogo ? (
            // eslint-disable-next-line @next/next/no-img-element -- viene de la API (bucket privado), no de /public
            <img src={`/api/profile/logo?v=${version}`} alt="Tu logo" className="max-h-16 max-w-44 object-contain" />
          ) : (
            <span className="text-sm text-muted">Sin logo</span>
          )}
        </div>
        <label className={`${buttonSecondary} cursor-pointer`}>
          {pending ? "Subiendo…" : me.hasLogo ? "Cambiar logo" : "Subir logo"}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg"
            disabled={pending}
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            className="sr-only"
          />
        </label>
        {me.hasLogo && (
          <button type="button" onClick={remove} disabled={pending} className={buttonDanger}>Quitar</button>
        )}
      </div>
      <FormError message={error} />
    </section>
  );
}

function PreferencesForm() {
  const { me, update } = useGlobal();
  const [rate, setRate] = useState<IvaRate>(me.preferences.defaultIvaRate);
  const [days, setDays] = useState(String(me.preferences.defaultDueDays));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      update(await api<MeDTO>("/api/profile", { method: "PUT", json: { preferences: { defaultIvaRate: rate, defaultDueDays: Number(days) } } }));
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className={`${panel} grid gap-4 p-5 sm:grid-cols-2`} aria-labelledby="prefs-title">
      <div className="sm:col-span-2">
        <h2 id="prefs-title" className="font-semibold">Preferencias</h2>
        <p className="text-sm text-muted">Lo que se completa solo en cada factura nueva.</p>
      </div>
      <div>
        <label htmlFor="pr-rate" className={label}>Alícuota de IVA por defecto</label>
        <select id="pr-rate" value={rate} onChange={(e) => { setSaved(false); setRate(Number(e.target.value) as IvaRate); }} className={input}>
          {IVA_RATES.map((r) => <option key={r} value={r}>{IVA_RATE_LABEL[r]}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="pr-days" className={label}>Vencimiento (días desde hoy)</label>
        <input id="pr-days" inputMode="numeric" value={days} onChange={(e) => { setSaved(false); setDays(e.target.value); }} className={`${input} tabular`} />
      </div>
      <div className="sm:col-span-2"><FormError message={error} /></div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className={button}>{pending ? "Guardando…" : "Guardar preferencias"}</button>
        <Saved show={saved} />
      </div>
    </form>
  );
}
