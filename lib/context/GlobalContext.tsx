"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { api } from "../fetcher";
import type { MeDTO } from "../types";

// ---------------------------------------------------------------------------
// Estado global del panel: el usuario autenticado, sus datos de emisor y
// sus preferencias (alícuota y vencimiento por defecto). Lo leen la
// cabecera, el perfil y el formulario de factura sin pedirlo cada uno.
//
// El servidor lo carga una vez (app/panel/layout.tsx) y lo pasa como valor
// inicial; quien cambia algo (Perfil) llama a update() o refresh().
// ---------------------------------------------------------------------------

interface GlobalState {
  me: MeDTO;
  /** Reemplaza el estado con lo que devolvió la API (por ejemplo, al guardar el perfil). */
  update: (me: MeDTO) => void;
  /** Lo vuelve a pedir al servidor. */
  refresh: () => Promise<void>;
}

const GlobalContext = createContext<GlobalState | null>(null);

export function GlobalProvider({ initial, children }: { initial: MeDTO; children: React.ReactNode }) {
  const [me, setMe] = useState<MeDTO>(initial);
  const refresh = useCallback(async () => {
    setMe(await api<MeDTO>("/api/auth/me"));
  }, []);
  return <GlobalContext.Provider value={{ me, update: setMe, refresh }}>{children}</GlobalContext.Provider>;
}

export function useGlobal(): GlobalState {
  const state = useContext(GlobalContext);
  if (!state) throw new Error("useGlobal fuera de <GlobalProvider>");
  return state;
}
