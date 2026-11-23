"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/panel", label: "Resumen" },
  { href: "/panel/facturas", label: "Facturas" },
  { href: "/panel/clientes", label: "Clientes" },
  { href: "/panel/perfil", label: "Perfil" },
];

export default function PanelNav() {
  return <PanelNavLinks pathname={usePathname()} />;
}

export function PanelNavLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Panel" className="flex gap-1 overflow-x-auto md:flex-col">
      {LINKS.map(({ href, label }) => {
        const active = pathname !== null && (href === "/panel" ? pathname === href : pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold ${
              active ? "bg-carbonico text-white" : "hover:bg-white"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
