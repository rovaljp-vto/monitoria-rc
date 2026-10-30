import { Link } from 'react-router-dom';
import { cx } from './ui';

/** Monograma vetorial: anel de nota com o check — o mesmo desenho do favicon. */
export function Monograma({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cx('size-6', className)} aria-hidden fill="none">
      <circle cx="16" cy="16" r="12" stroke="currentColor" strokeOpacity=".3" strokeWidth="3" />
      <path d="M16 4a12 12 0 0 1 11.3 16" stroke="var(--marca)" strokeWidth="3" strokeLinecap="round" />
      <path d="m10.8 16.3 3.7 3.7 6.8-7.4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Marca do topo das telas internas: volta para a home. */
export function MarcaTopo() {
  return (
    <Link to="/" className="group flex items-center gap-2.5 rounded-lg" aria-label="Checklist Comercial — início">
      <Monograma className="size-8 text-fg transition-transform group-hover:scale-105" />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[17px] font-semibold tracking-tight">Checklist</span>
        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-fg-3">Comercial</span>
      </span>
    </Link>
  );
}
