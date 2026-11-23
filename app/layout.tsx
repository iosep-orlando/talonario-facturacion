import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Las dos letras (licencia OFL) están en el repo: compilar no depende de la red.
const bricolage = localFont({
  src: "./fonts/bricolage-grotesque-variable.woff2",
  variable: "--font-bricolage",
  weight: "200 800",
  display: "swap",
});
const publicSans = localFont({
  src: "./fonts/public-sans-variable.woff2",
  variable: "--font-public-sans",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Talonario · Facturación sin vueltas", template: "%s · Talonario" },
  description: "Cargá tus clientes, emití facturas A, B o C con el IVA bien calculado y mandalas por mail en PDF.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-AR" className={`${bricolage.variable} ${publicSans.variable} h-full antialiased`}>
      <body className="min-h-full bg-papel font-sans text-tinta">{children}</body>
    </html>
  );
}
