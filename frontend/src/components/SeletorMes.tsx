import { ChevronLeft, ChevronRight } from 'lucide-react';
import { deslocarMes, fmtMes, mesAtual } from '@/lib/formato';

/** Navega mês a mês; não avança além do mês corrente. */
export function SeletorMes({ mes, onChange }: { mes: string; onChange: (m: string) => void }) {
  const atual = mesAtual();
  return (
    <div className="flex items-center gap-1 rounded-xl border border-borda bg-card p-1" role="group" aria-label="Mês de referência">
      <button
        type="button"
        onClick={() => onChange(deslocarMes(mes, -1))}
        className="grid size-8 place-items-center rounded-lg text-fg-2 transition hover:bg-card-hover hover:text-fg"
        aria-label="Mês anterior"
      >
        <ChevronLeft className="size-4" aria-hidden />
      </button>
      <span className="min-w-36 text-center text-sm font-medium first-letter:uppercase" aria-live="polite">
        {fmtMes(mes)}
      </span>
      <button
        type="button"
        onClick={() => onChange(deslocarMes(mes, 1))}
        disabled={mes >= atual}
        className="grid size-8 place-items-center rounded-lg text-fg-2 transition hover:bg-card-hover hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent"
        aria-label="Próximo mês"
      >
        <ChevronRight className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/** Mês guardado na URL (?mes=AAAA-MM): recarregar ou compartilhar o link mantém a visão. */
export function useMesDaUrl(busca: URLSearchParams, setBusca: (b: URLSearchParams) => void): [string, (m: string) => void] {
  const mes = /^\d{4}-\d{2}$/.test(busca.get('mes') ?? '') ? (busca.get('mes') as string) : mesAtual();
  const mudar = (m: string) => {
    const nova = new URLSearchParams(busca);
    if (m === mesAtual()) nova.delete('mes');
    else nova.set('mes', m);
    setBusca(nova);
  };
  return [mes, mudar];
}
