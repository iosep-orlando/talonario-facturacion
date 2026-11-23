import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Suspense } from "react";
import Logo from "@/components/Logo";
import { button, buttonSecondary } from "@/components/ui";
import { SESSION_COOKIE, verifySession } from "@/lib/jwt";

export const metadata: Metadata = {
  title: { absolute: "Talonario · Facturación sin vueltas" },
};

// La landing pública. Hecha con la skill frontend-design: la idea es el
// talonario de facturas de papel (la hoja original, el duplicado amarillo
// y el talón troquelado) llevado a la pantalla.
export default function LandingPage() {
  return (
    <div className="overflow-x-clip">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5">
        <Logo href="/" />
        <Suspense fallback={<Link href="/login" className={buttonSecondary}>Entrar</Link>}>
          <HeaderAction />
        </Suspense>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-8 lg:grid-cols-[1fr_1.05fr] lg:pt-16">
          <div>
            <h1 className="display text-6xl sm:text-7xl lg:text-8xl">
              Tu talonario,
              <br />
              sin el carbónico.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted">
              Cargá tus clientes, armá la factura y Talonario le pone la letra que corresponde, calcula el IVA al
              centavo, la numera y te la deja en PDF para mandarla por mail. Entrás con un enlace, sin contraseña.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/login" className={`${button} px-6 py-3 text-lg`}>Empezar gratis</Link>
              <a href="#como" className="px-2 py-3 font-semibold text-carbonico hover:underline">Ver cómo funciona</a>
            </div>
          </div>
          <HeroTalonario />
        </section>

        <section id="como" className="border-y border-line bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="display text-4xl sm:text-5xl">Una factura en tres pasos</h2>
            <ol className="mt-10 grid gap-10 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="grid grid-cols-[auto_1fr] gap-x-4">
                  <span className="display row-span-2 text-5xl text-carbonico" aria-hidden="true">{i + 1}</span>
                  <h3 className="text-lg font-bold">{step.title}</h3>
                  <p className="mt-1 text-muted">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-10 px-4 py-20 lg:grid-cols-2">
          <div>
            <h2 className="display text-4xl sm:text-5xl">Las cuentas cierran al centavo</h2>
            <p className="mt-5 text-lg text-muted">
              Una computadora no guarda bien los decimales: para ella, $ 4,35 por 100 da{" "}
              <span className="tabular whitespace-nowrap text-tinta">434,99999999999994</span>. En una planilla eso es
              un centavo que se pierde en algún redondeo; en una factura, un total que no coincide con la suma de sus
              líneas.
            </p>
            <p className="mt-4 text-lg text-muted">
              Talonario guarda y opera todos los importes en centavos enteros, y redondea el IVA línea por línea. Los
              pesos con coma aparecen recién en la pantalla y en el PDF.
            </p>
          </div>
          <figure className="self-center rounded-lg border border-line bg-white p-4 sm:p-6">
            <table className="tabular w-full whitespace-nowrap text-left text-sm sm:text-base">
              <caption className="whitespace-normal pb-3 text-left text-sm text-muted">3 unidades a $ 1.234,57 con IVA 21 %</caption>
              <tbody className="divide-y divide-line">
                <tr><th className="py-2 font-normal text-muted">Neto</th><td className="py-2 text-right">370.371 centavos</td><td className="py-2 text-right font-semibold">$ 3.703,71</td></tr>
                <tr><th className="py-2 font-normal text-muted">IVA 21 %</th><td className="py-2 text-right">77.778 centavos</td><td className="py-2 text-right font-semibold">$ 777,78</td></tr>
                <tr><th className="py-2 font-bold">Total</th><td className="py-2 text-right">448.149 centavos</td><td className="py-2 text-right text-lg font-bold">$ 4.481,49</td></tr>
              </tbody>
            </table>
            <figcaption className="mt-3 text-sm text-muted">
              El IVA exacto sería 77.777,91 centavos: se redondea al más cercano una sola vez, y el total es la suma
              de dos enteros.
            </figcaption>
          </figure>
        </section>

        <section className="bg-tinta text-white">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 md:grid-cols-[1fr_1fr]">
            <div>
              <h2 className="display text-4xl">A, B o C, sin pensarlo</h2>
              <p className="mt-4 text-white/75">
                Si sos responsable inscripto, a otro inscripto o a un monotributista le hacés una A, con el IVA
                discriminado; a un consumidor final, una B con el IVA contenido que pide la Ley 27.743. Si sos
                monotributista, siempre C. Talonario lo decide con la condición de cada uno.
              </p>
            </div>
            <div>
              <h2 className="display text-4xl">Lo que todavía no hace</h2>
              <p className="mt-4 text-white/75">
                No se conecta con ARCA: las facturas no tienen CAE y no sirven como comprobante fiscal. Es un
                proyecto de práctica, ideal para probar el circuito completo con datos inventados.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted">
        <Logo href="/" />
        <p>Proyecto 1.3.130 de CodeCrypto Academy. Next.js, MongoDB, RustFS y MailHog.</p>
      </footer>
    </div>
  );
}

const STEPS = [
  { title: "Cargás al cliente", text: "Nombre, CUIT o DNI y su condición frente al IVA. El CUIT se controla con su dígito verificador." },
  { title: "Armás la factura", text: "Las líneas con cantidad, precio y alícuota. Los totales se ven mientras escribís; queda como borrador." },
  { title: "La emitís y la mandás", text: "Recibe el próximo número, se genera el PDF con tu logo y sale por mail. Después la marcás como pagada." },
];

/** Con sesión, el botón lleva al panel; sin sesión, a entrar. */
async function HeaderAction() {
  const jwt = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = jwt ? await verifySession(jwt) : null;
  return session ? (
    <Link href="/panel" className={button}>Ir al panel</Link>
  ) : (
    <Link href="/login" className={buttonSecondary}>Entrar</Link>
  );
}

const HERO_LINES = [
  { description: "Café de especialidad, 1 kg", qty: "4", amount: "$ 87.120,00" },
  { description: "Filtros de papel x 100", qty: "10", amount: "$ 21.780,00" },
  { description: "Molienda a pedido", qty: "1", amount: "$ 6.050,00" },
];

/** La hoja de talonario de la portada: talón, original y el duplicado amarillo detrás. */
function HeroTalonario() {
  return (
    <div className="relative mx-auto w-full max-w-xl" aria-label="Ejemplo de factura B de Talonario" role="img">
      {/* El duplicado, corrido hacia abajo. */}
      <div className="absolute inset-0 translate-x-3 translate-y-4 rotate-[1.5deg] rounded-md bg-duplicado" aria-hidden="true" />
      <div className="relative flex rounded-md bg-white shadow-[0_1px_0_var(--color-line),0_18px_40px_-24px_rgba(28,27,46,0.45)]" aria-hidden="true">
        {/* El talón, con su línea troquelada. */}
        <div className="hidden w-32 shrink-0 flex-col gap-3 border-r-2 border-dashed border-line p-4 text-xs sm:flex">
          <span className="text-muted">N.º</span>
          <span className="tabular -mt-2 whitespace-nowrap font-bold">0001-00000042</span>
          <span className="text-muted">Fecha</span>
          <span className="tabular -mt-2 font-bold">23/11/2026</span>
          <span className="text-muted">Cliente</span>
          <span className="-mt-2 font-bold">Ñandú Café</span>
          <span className="text-muted">Importe</span>
          <span className="tabular -mt-2 font-bold">$ 114.950</span>
        </div>
        <div className="min-w-0 flex-1 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-bold">Tostadero La Esquina</p>
              <p className="text-xs text-muted">Responsable inscripto</p>
            </div>
            <span className="display flex h-12 w-12 shrink-0 items-center justify-center rounded border-2 border-tinta text-3xl">B</span>
            <div className="text-right text-xs">
              <p className="display text-xl">FACTURA</p>
              <p className="tabular text-muted">0001-00000042</p>
            </div>
          </div>
          <table className="tabular mt-6 w-full text-sm">
            <tbody className="divide-y divide-line">
              {HERO_LINES.map((l) => (
                <tr key={l.description}>
                  <td className="py-2 pr-2">{l.description}</td>
                  <td className="py-2 pr-2 text-right text-muted">{l.qty}</td>
                  <td className="py-2 text-right">{l.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex items-end justify-between border-t-2 border-tinta pt-3">
            <span className="text-xs text-muted">IVA contenido $ 19.950,00</span>
            <span className="tabular text-2xl font-bold">$ 114.950,00</span>
          </div>
        </div>
      </div>
      <span
        className="stamp-in display absolute -bottom-9 left-3 rounded border-[3px] border-pagada bg-white/70 px-4 py-1 text-4xl text-pagada sm:left-[42%]"
        aria-hidden="true"
      >
        PAGADA
      </span>
    </div>
  );
}
