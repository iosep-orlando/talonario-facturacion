import Link from "next/link";

/** La marca: una hoja de talonario (con su borde troquelado) y el nombre. */
export default function Logo({ href = "/panel" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 self-start text-tinta">
      <svg viewBox="0 0 22 26" aria-hidden="true" className="h-6 w-5 shrink-0">
        <rect x="5" y="1" width="16" height="24" rx="1.5" fill="var(--color-carbonico)" />
        {[4, 9, 14, 19].map((y) => (
          <circle key={y} cx="2.5" cy={y + 1.5} r="1.3" fill="var(--color-carbonico)" />
        ))}
        <rect x="8.5" y="6" width="9" height="1.6" rx="0.8" fill="white" />
        <rect x="8.5" y="10" width="6" height="1.6" rx="0.8" fill="white" opacity="0.7" />
        <rect x="8.5" y="18" width="9" height="2" rx="1" fill="var(--color-duplicado)" />
      </svg>
      <span className="display text-xl">Talonario</span>
    </Link>
  );
}
