"use client";

import { useState } from "react";
import { monthLong, monthShort } from "@/lib/format";
import { formatMoney } from "@/lib/money";

interface Point {
  month: string;
  cents: number;
  count: number;
}

/**
 * Lo facturado por mes: una sola serie, barras finas con el extremo
 * redondeado, el valor del mes actual escrito y el resto al pasar el mouse
 * (o al llegar con el teclado). Debajo, la misma información en una tabla
 * para lectores de pantalla.
 */
export default function MonthlyChart({ data }: { data: Point[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.cents), 1);
  const current = data.length - 1;
  const shown = active ?? current;

  return (
    <figure>
      <div className="relative flex h-40 items-end gap-3 border-b border-line pb-px" onMouseLeave={() => setActive(null)}>
        {data.map((d, i) => {
          const height = d.cents === 0 ? 0 : Math.max(3, Math.round((d.cents / max) * 100));
          return (
            <button
              key={d.month}
              type="button"
              aria-label={`${monthLong(d.month)}: ${formatMoney(d.cents)}`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className="group relative flex h-full flex-1 items-end justify-center"
            >
              <span
                className={`block w-full max-w-10 rounded-t-[4px] ${i === shown ? "bg-carbonico" : "bg-carbonico/35 group-hover:bg-carbonico/60"}`}
                style={{ height: `${height}%` }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex gap-3 text-xs text-muted" aria-hidden="true">
        {data.map((d, i) => (
          <span key={d.month} className={`flex-1 text-center ${i === shown ? "font-bold text-tinta" : ""}`}>
            {monthShort(d.month)}
          </span>
        ))}
      </div>
      <figcaption className="mt-3 text-sm" aria-live="polite">
        <span className="text-muted">{monthLong(data[shown].month)}:</span>{" "}
        <strong className="tabular">{formatMoney(data[shown].cents)}</strong>{" "}
        <span className="text-muted">
          en {data[shown].count} {data[shown].count === 1 ? "factura" : "facturas"}
        </span>
      </figcaption>
      <table className="sr-only">
        <caption>Facturado por mes</caption>
        <thead>
          <tr>
            <th>Mes</th>
            <th>Facturado</th>
            <th>Facturas</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}>
              <td>{monthLong(d.month)}</td>
              <td>{formatMoney(d.cents)}</td>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
