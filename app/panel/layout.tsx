import { redirect } from "next/navigation";
import { Suspense } from "react";
import PanelHeader from "@/components/PanelHeader";
import PanelNav, { PanelNavLinks } from "@/components/PanelNav";
import { GlobalProvider } from "@/lib/context/GlobalContext";
import { pageUser } from "@/lib/page-auth";
import { loadMe } from "@/lib/store/profile";

// El panel privado. proxy.ts ya exige sesión; acá se confirma contra la
// base y se carga el estado global (usuario, perfil y preferencias).
export default function PanelLayout({ children }: LayoutProps<"/panel">) {
  return (
    <Suspense fallback={<div className="h-16 border-b border-line bg-white" />}>
      <PanelShell>{children}</PanelShell>
    </Suspense>
  );
}

async function PanelShell({ children }: { children: React.ReactNode }) {
  const caller = await pageUser();
  const me = await loadMe(caller.userId);
  if (!me) redirect("/login");
  return (
    <GlobalProvider initial={me}>
      <PanelHeader />
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 md:grid-cols-[10rem_1fr]">
        {/* usePathname depende de la URL: en Suspense, con los enlaces sin resaltar mientras tanto. */}
        <Suspense fallback={<PanelNavLinks pathname={null} />}>
          <PanelNav />
        </Suspense>
        <div className="min-w-0">{children}</div>
      </div>
    </GlobalProvider>
  );
}
