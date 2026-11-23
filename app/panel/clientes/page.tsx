import type { Metadata } from "next";
import { Suspense } from "react";
import ClientsManager from "@/components/ClientsManager";
import { pageTitle } from "@/components/ui";
import { pageUser } from "@/lib/page-auth";
import { listClients } from "@/lib/store/clients";

export const metadata: Metadata = { title: "Clientes" };

export default function ClientsPage({ searchParams }: PageProps<"/panel/clientes">) {
  return (
    <main>
      <h1 className={pageTitle}>Clientes</h1>
      <Suspense fallback={<p className="mt-6 text-muted">Cargando…</p>}>
        <Clients searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

// La primera lista sale de MongoDB en el servidor; las altas y cambios van a la API.
async function Clients({ searchParams }: { searchParams: PageProps<"/panel/clientes">["searchParams"] }) {
  const caller = await pageUser();
  const [clients, params] = await Promise.all([listClients(caller.userId), searchParams]);
  return <ClientsManager initial={clients} openNew={params.nuevo === "1"} />;
}
