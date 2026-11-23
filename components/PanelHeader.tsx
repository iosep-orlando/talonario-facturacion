"use client";

import { useRouter } from "next/navigation";
import { useGlobal } from "@/lib/context/GlobalContext";
import { api } from "@/lib/fetcher";
import Logo from "./Logo";

export default function PanelHeader() {
  const { me } = useGlobal();
  const router = useRouter();

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
        <Logo />
        {me.profile.businessName && <span className="font-semibold">{me.profile.businessName}</span>}
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="hidden text-muted sm:inline">{me.user.email}</span>
          <button type="button" onClick={logout} className="rounded-md px-2 py-1 font-semibold text-muted hover:bg-papel hover:text-tinta">
            Salir
          </button>
        </div>
      </div>
    </header>
  );
}
