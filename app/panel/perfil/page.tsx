import type { Metadata } from "next";
import ProfileForm from "@/components/ProfileForm";
import { pageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Perfil" };

// Los datos vienen del estado global (GlobalContext), que cargó el layout del panel.
export default function ProfilePage() {
  return (
    <main>
      <h1 className={pageTitle}>Perfil</h1>
      <ProfileForm />
    </main>
  );
}
