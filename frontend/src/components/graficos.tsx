import { type ReactNode, useEffect, useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus, Table2, BarChart3 } from 'lucide-react';
import { fmtNota } from '@/lib/formato';
import { cx } from './ui';

/**
 * Peças dos gráficos do dashboard — regras do guia de visualização:
 * marcas finas, grade discreta, texto sempre nas cores de texto (nunca na cor
 * da série), dica ao passar o mouse, e toda visualização com uma TABELA
 * equivalente (valor nunca fica só na cor ou só no tooltip).
 */

/** Tema atual — os gráficos escolhem degraus de cor diferentes no escuro. */
export function useTemaEscuro(): boolean {
  const ler = () => document.documentElement.dataset.tema !== 'claro';
  const [escuro, setEscuro] = useState(ler);
  useEffect(() => {
    const obs = new MutationObserver(() => setEscuro(ler()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] });
    return () => obs.disconnect();
  }, []);
  return escuro;
}

export const EIXO = { stroke: 'var(--eixo)', fontSize: 11, fontFamily: 'var(--font-sans)' };

export function CartaoGrafico({
  titulo,
  subtitulo,
  tabela,
  acao,
  className,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  /** Tabela equivalente ao gráfico — acessível e conferível. */
  tabela?: ReactNode;
  acao?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const [verTabela, setVerTabela] = useState(false);
  return (
    <section className={cx('vidro flex min-w-0 flex-col rounded-2xl p-5', className)}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold leading-snug">{titulo}</h2>
          {subtitulo && <p className="mt-0.5 text-xs text-fg-3">{subtitulo}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {acao}
          {tabela && (
            <button
              type="button"
              onClick={() => setVerTabela((v) => !v)}
              className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-fg-3 transition hover:bg-card-hover hover:text-fg"
              aria-pressed={verTabela}
            >
              {verTabela ? <BarChart3 className="size-3.5" aria-hidden /> : <Table2 className="size-3.5" aria-hidden />}
              {verTabela ? 'Gráfico' : 'Tabela'}
            </button>
          )}
        </div>
      </header>
      <div className="min-w-0 flex-1">{verTabela && tabela ? <div className="overflow-x-auto">{tabela}</div> : children}</div>
    </section>
  );
}

export function Tabela({ cabecalho, linhas }: { cabecalho: string[]; linhas: (string | number | null)[][] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-borda text-left text-xs text-fg-3">
          {cabecalho.map((c, i) => (
            <th key={c} className={cx('py-2 pr-3 font-medium', i > 0 && 'text-right')}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((l, i) => (
          <tr key={i} className="border-b border-borda/60 last:border-0">
            {l.map((v, j) => (
              <td key={j} className={cx('py-2 pr-3', j > 0 && 'num text-right text-fg-2')}>
                {v === null ? '—' : typeof v === 'number' ? fmtNota(v) : v}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Caixa de dica dos gráficos (recharts `content`). */
export function CaixaDica({ titulo, linhas }: { titulo: string; linhas: { cor?: string; rotulo: string; valor: string }[] }) {
  return (
    <div className="rounded-xl border border-borda-forte bg-card-forte px-3 py-2 text-xs shadow-card backdrop-blur-xl">
      <p className="mb-1 font-semibold text-fg first-letter:uppercase">{titulo}</p>
      {linhas.map((l) => (
        <p key={l.rotulo} className="flex items-center gap-2 text-fg-2">
          {l.cor && <span className="size-2 shrink-0 rounded-full" style={{ background: l.cor }} aria-hidden />}
          <span className="flex-1">{l.rotulo}</span>
          <span className="num font-semibold text-fg">{l.valor}</span>
        </p>
      ))}
    </div>
  );
}

// ── Indicador (stat tile) ───────────────────────────────────────────────────

/**
 * Valor + variação vs período anterior + minigráfico.
 * `bomQuandoSobe`: a cor da variação depende do que é "melhor" (nota subir é
 * bom; % em foco subir é ruim). A seta e o sinal vão junto — nunca só cor.
 */
export function Indicador({
  rotulo,
  valor,
  sufixo = '',
  anterior,
  bomQuandoSobe = true,
  serie,
  detalhe,
  destaque,
}: {
  rotulo: string;
  valor: number | null;
  sufixo?: string;
  anterior?: number | null;
  bomQuandoSobe?: boolean;
  serie?: (number | null)[];
  detalhe?: string;
  destaque?: boolean;
}) {
  const delta = valor !== null && anterior !== null && anterior !== undefined ? valor - anterior : null;
  const neutro = delta === null || Math.abs(delta) < 0.05;
  const bom = !neutro && (delta! > 0) === bomQuandoSobe;
  return (
    <div className={cx('vidro flex min-w-0 flex-col gap-2 rounded-2xl p-4', destaque && 'ring-1 ring-marca/30')}>
      <span className="text-xs font-medium text-fg-3">{rotulo}</span>
      <div className="flex items-end justify-between gap-2">
        <span className={cx('font-sans font-semibold leading-none tracking-tight', destaque ? 'text-4xl' : 'text-3xl')}>
          {valor === null ? '—' : fmtNota(valor)}
          {valor !== null && sufixo && <span className="ml-0.5 text-lg font-medium text-fg-3">{sufixo}</span>}
        </span>
        {serie && <MiniGrafico valores={serie} />}
      </div>
      <span className="flex items-center gap-1 text-xs">
        {delta === null ? (
          <span className="text-fg-3">{detalhe ?? 'sem período anterior para comparar'}</span>
        ) : (
          <>
            <span
              className={cx(
                'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold',
                neutro ? 'bg-card-hover text-fg-2' : bom ? 'bg-excelente-bg text-excelente' : 'bg-critico-bg text-critico',
              )}
            >
              {neutro ? <Minus className="size-3" aria-hidden /> : delta! > 0 ? <ArrowUpRight className="size-3" aria-hidden /> : <ArrowDownRight className="size-3" aria-hidden />}
              {delta! > 0 ? '+' : ''}
              {fmtNota(delta!)}
              {sufixo === '%' ? ' p.p.' : ''}
            </span>
            <span className="text-fg-3">vs período anterior</span>
          </>
        )}
      </span>
    </div>
  );
}

/** Minigráfico de tendência: cinza de fundo, último ponto na cor de destaque. */
export function MiniGrafico({ valores, largura = 84, altura = 30 }: { valores: (number | null)[]; largura?: number; altura?: number }) {
  const pontos = valores.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (pontos.length < 2) return null;
  const min = Math.min(...pontos.map((p) => p.v));
  const max = Math.max(...pontos.map((p) => p.v));
  const x = (i: number) => (i / Math.max(1, valores.length - 1)) * (largura - 6) + 3;
  const y = (v: number) => (max === min ? altura / 2 : altura - 4 - ((v - min) / (max - min)) * (altura - 8));
  const d = pontos.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const ult = pontos[pontos.length - 1];
  return (
    <svg width={largura} height={altura} aria-hidden className="shrink-0 overflow-visible">
      <path d={d} fill="none" stroke="var(--fg-3)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(ult.i)} cy={y(ult.v)} r={3.5} fill="var(--serie-1)" stroke="var(--bg)" strokeWidth={2} />
    </svg>
  );
}

// ── Mapa de calor ───────────────────────────────────────────────────────────

/**
 * As MESMAS 4 faixas do resto do sistema (Crítico, Regular, Bom, Excelente),
 * aplicadas ao % de "Sim". O que precisa de atenção vem em cor cheia e salta;
 * o que está bem fica em tom suave e não compete. Cada faixa tem nome na
 * legenda, e as células abaixo da meta levam ícone — nunca só cor.
 */
export interface LimitesMapa {
  regularMin: number;
  bomMin: number;
  excelenteMin: number;
}

type NivelMapa = 'CRITICO' | 'REGULAR' | 'BOM' | 'EXCELENTE';

function nivel(valor: number, l: LimitesMapa): NivelMapa {
  if (valor >= l.excelenteMin) return 'EXCELENTE';
  if (valor >= l.bomMin) return 'BOM';
  if (valor >= l.regularMin) return 'REGULAR';
  return 'CRITICO';
}

const ESTILO_NIVEL: Record<NivelMapa, { celula: string; amostra: string; rotulo: string }> = {
  CRITICO: { celula: 'bg-critico text-[var(--critico-sobre)]', amostra: 'bg-critico', rotulo: 'Crítico' },
  REGULAR: { celula: 'bg-regular text-[#1c1412]', amostra: 'bg-regular', rotulo: 'Regular' },
  BOM: { celula: 'bg-bom-bg text-fg', amostra: 'bg-bom-bg ring-1 ring-bom/40', rotulo: 'Bom' },
  EXCELENTE: { celula: 'bg-excelente-bg text-fg', amostra: 'bg-excelente-bg ring-1 ring-excelente/40', rotulo: 'Excelente' },
};

export function LegendaMapa({ limites }: { limites: LimitesMapa }) {
  const faixas: { n: NivelMapa; txt: string }[] = [
    { n: 'CRITICO', txt: `abaixo de ${limites.regularMin}%` },
    { n: 'REGULAR', txt: `${limites.regularMin}–${limites.bomMin - 1}%` },
    { n: 'BOM', txt: `${limites.bomMin}–${limites.excelenteMin - 1}%` },
    { n: 'EXCELENTE', txt: `${limites.excelenteMin}% ou mais` },
  ];
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-fg-2">
      <span className="text-fg-3">% de “Sim”:</span>
      {faixas.map((f) => (
        <span key={f.n} className="flex items-center gap-1.5">
          <span className={cx('size-3.5 rounded-[4px]', ESTILO_NIVEL[f.n].amostra)} aria-hidden />
          <strong className="font-semibold text-fg">{ESTILO_NIVEL[f.n].rotulo}</strong> {f.txt}
        </span>
      ))}
    </div>
  );
}

function mediaDe(valores: (number | null)[]): number | null {
  const v = valores.filter((x): x is number => x !== null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

export function MapaDeCalor({
  linhas,
  colunas,
  valor,
  limites,
  rotuloLinha,
  onLinha,
  linhaAtiva,
}: {
  linhas: { id: string; rotulo: string }[];
  colunas: { id: string; rotulo: string }[];
  valor: (linha: string, coluna: string) => number | null;
  limites: LimitesMapa;
  rotuloLinha: string;
  onLinha?: (id: string) => void;
  linhaAtiva?: string;
}) {
  const mediaLinha = (l: string) => mediaDe(colunas.map((c) => valor(l, c.id)));
  const mediaColuna = (c: string) => mediaDe(linhas.map((l) => valor(l.id, c)));

  const Celula = ({ v, rotulo, forte }: { v: number | null; rotulo: string; forte?: boolean }) => {
    if (v === null) {
      return (
        <td className="h-11 rounded-md border border-dashed border-borda text-center text-xs text-fg-3" aria-label={`${rotulo}: sem dados`}>
          —
        </td>
      );
    }
    const n = nivel(v, limites);
    const abaixo = n === 'CRITICO' || n === 'REGULAR';
    return (
      <td
        tabIndex={0}
        aria-label={`${rotulo}: ${fmtNota(v)}% de Sim, ${ESTILO_NIVEL[n].rotulo}`}
        className={cx(
          'num h-11 rounded-md px-1 text-center text-[13px] outline-none transition focus-visible:ring-2 focus-visible:ring-fg',
          ESTILO_NIVEL[n].celula,
          forte ? 'font-bold' : 'font-semibold',
        )}
      >
        <span className="inline-flex items-center gap-0.5">
          {abaixo && <AlertTriangle className="size-3 opacity-80" aria-hidden />}
          {Math.round(v)}%
        </span>
      </td>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate" style={{ borderSpacing: 3 }}>
        <thead>
          <tr>
            <th className="pb-1 pr-2 text-left text-[11px] font-medium text-fg-3">{rotuloLinha}</th>
            {colunas.map((c) => (
              <th key={c.id} className="min-w-16 px-1 pb-1 text-center align-bottom text-[11px] font-medium leading-tight text-fg-2">
                {c.rotulo}
              </th>
            ))}
            <th className="min-w-16 border-l border-borda px-1 pb-1 text-center align-bottom text-[11px] font-bold uppercase tracking-wide text-fg">Média</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id} className={cx('transition-opacity', linhaAtiva && linhaAtiva !== l.id && 'opacity-35')}>
              <th scope="row" className="max-w-44 pr-2 text-left text-[13px] font-semibold">
                {onLinha ? (
                  <button type="button" onClick={() => onLinha(l.id)} className="max-w-full truncate text-left hover:text-marca-texto hover:underline">
                    {l.rotulo}
                  </button>
                ) : (
                  <span className="block truncate">{l.rotulo}</span>
                )}
              </th>
              {colunas.map((c) => (
                <Celula key={c.id} v={valor(l.id, c.id)} rotulo={`${l.rotulo} · ${c.rotulo}`} />
              ))}
              <Celula v={mediaLinha(l.id)} rotulo={`${l.rotulo} · média`} forte />
            </tr>
          ))}
          <tr>
            <th scope="row" className="border-t border-borda pr-2 pt-1 text-left text-[11px] font-bold uppercase tracking-wide">
              Média
            </th>
            {colunas.map((c) => (
              <Celula key={c.id} v={mediaColuna(c.id)} rotulo={`${c.rotulo} · média`} forte />
            ))}
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
