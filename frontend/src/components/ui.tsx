import { type ButtonHTMLAttributes, type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Inbox, Loader2, Moon, Sun } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { FAIXAS } from '@/lib/modulos';
import type { Faixa } from '@/lib/tipos';
import { fmtNota } from '@/lib/formato';

export const EASE = [0.22, 1, 0.36, 1] as const;

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ');
}

// ── Botões ──────────────────────────────────────────────────────────────────

type Variante = 'primario' | 'fantasma' | 'sutil';

const VARIANTES: Record<Variante, string> = {
  primario:
    'bg-gradient-to-br from-marca to-marca-forte text-white shadow-marca hover:brightness-110 disabled:shadow-none',
  fantasma: 'border border-borda bg-card text-fg hover:bg-card-hover hover:border-borda-forte',
  sutil: 'text-fg-2 hover:text-fg hover:bg-card',
};

export function Botao({
  variante = 'primario',
  carregando,
  icone,
  className,
  children,
  disabled,
  ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; carregando?: boolean; icone?: ReactNode }) {
  return (
    <button
      {...resto}
      disabled={disabled || carregando}
      className={cx(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition',
        'active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45',
        VARIANTES[variante],
        className,
      )}
    >
      {carregando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icone}
      {children}
    </button>
  );
}

// ── Nota e faixa ────────────────────────────────────────────────────────────

export function SeloFaixa({ faixa, tamanho = 'md' }: { faixa: Faixa | null; tamanho?: 'sm' | 'md' }) {
  if (!faixa) return <span className="text-xs text-fg-3">Sem nota</span>;
  const f = FAIXAS[faixa];
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full font-semibold',
        f.cor,
        f.fundo,
        tamanho === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {f.rotulo}
    </span>
  );
}

/** Nota com a cor da faixa. A faixa vem sempre também como texto (acessibilidade). */
export function Nota({ nota, faixa, className }: { nota: number | null; faixa: Faixa | null; className?: string }) {
  return (
    <span className={cx('num font-semibold', faixa ? FAIXAS[faixa].cor : 'text-fg-3', className)}>
      {fmtNota(nota)}
    </span>
  );
}

/** Anel de progresso — cobertura do mês ou nota ao vivo. */
export function Anel({
  valor,
  tamanho = 120,
  espessura = 10,
  cor = 'var(--marca)',
  children,
  rotulo,
}: {
  valor: number;
  tamanho?: number;
  espessura?: number;
  cor?: string;
  children?: ReactNode;
  rotulo: string;
}) {
  const r = (tamanho - espessura) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, valor));
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho} className="-rotate-90" role="img" aria-label={rotulo}>
        <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke="var(--borda)" strokeWidth={espessura} />
        <motion.circle
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={r}
          fill="none"
          stroke={cor}
          strokeWidth={espessura}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c - (v / 100) * c }}
          transition={{ duration: 0.8, ease: EASE }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function Barra({ valor, className }: { valor: number; className?: string }) {
  const v = Math.max(0, Math.min(100, valor));
  const completo = v >= 100;
  return (
    <div className={cx('h-1.5 overflow-hidden rounded-full bg-borda', className)} aria-hidden>
      <motion.div
        className={cx('h-full rounded-full', completo ? 'bg-excelente' : 'bg-marca')}
        initial={{ width: 0 }}
        animate={{ width: `${v}%` }}
        transition={{ duration: 0.7, ease: EASE }}
      />
    </div>
  );
}

// ── Estrutura ───────────────────────────────────────────────────────────────

export function Cartao({ className, children, as: Tag = 'section' }: { className?: string; children: ReactNode; as?: 'section' | 'div' | 'article' }) {
  return <Tag className={cx('vidro rounded-2xl', className)}>{children}</Tag>;
}

export function Rotulo({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx('text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-3', className)}>{children}</span>
  );
}

export function Campo({ rotulo, dica, erro, children, htmlFor }: { rotulo: string; dica?: string; erro?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-fg">
        {rotulo}
      </label>
      {children}
      {erro ? (
        <span className="text-xs text-critico" role="alert">
          {erro}
        </span>
      ) : dica ? (
        <span className="text-xs text-fg-3">{dica}</span>
      ) : null}
    </div>
  );
}

// ── Estados ─────────────────────────────────────────────────────────────────

export function Esqueleto({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-xl bg-card-hover', className)} aria-hidden />;
}

export function CarregandoTela({ linhas = 4 }: { linhas?: number }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Carregando">
      <Esqueleto className="h-28" />
      {Array.from({ length: linhas }, (_, i) => (
        <Esqueleto key={i} className="h-14" />
      ))}
    </div>
  );
}

export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ApiError) return erro.message;
  if (erro instanceof Error) return erro.message;
  return 'Algo deu errado.';
}

export function Aviso({ tipo = 'erro', titulo, children }: { tipo?: 'erro' | 'alerta' | 'info'; titulo?: string; children: ReactNode }) {
  const estilo =
    tipo === 'erro'
      ? 'border-critico/30 bg-critico-bg text-critico'
      : tipo === 'alerta'
        ? 'border-regular/30 bg-regular-bg text-regular'
        : 'border-borda bg-card text-fg-2';
  return (
    <div role={tipo === 'erro' ? 'alert' : 'status'} className={cx('flex gap-3 rounded-xl border px-4 py-3 text-sm', estilo)}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex flex-col gap-0.5">
        {titulo && <strong className="font-semibold">{titulo}</strong>}
        <span className={tipo === 'info' ? '' : 'text-fg-2'}>{children}</span>
      </div>
    </div>
  );
}

export function ErroTela({ erro, onTentar }: { erro: unknown; onTentar?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <Aviso titulo="Não foi possível carregar">{mensagemDeErro(erro)}</Aviso>
      {onTentar && (
        <Botao variante="fantasma" onClick={onTentar}>
          Tentar de novo
        </Botao>
      )}
    </div>
  );
}

export function Vazio({ titulo, children, icone }: { titulo: string; children?: ReactNode; icone?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-borda px-6 py-12 text-center">
      <span className="grid size-11 place-items-center rounded-xl bg-card text-fg-3">{icone ?? <Inbox className="size-5" aria-hidden />}</span>
      <p className="font-semibold">{titulo}</p>
      {children && <p className="max-w-md text-sm text-fg-2">{children}</p>}
    </div>
  );
}

// ── Dica (tooltip) ──────────────────────────────────────────────────────────

/**
 * Dica ao passar o mouse — no lugar do `title` nativo, que é pequeno, cinza e
 * demora a aparecer. Também aparece no foco pelo teclado. É decorativa
 * (aria-hidden): o nome acessível continua no `aria-label` do botão.
 *
 * Desenhada num portal no <body>, com posição fixa calculada a partir do
 * gatilho: dentro de um cartão de vidro (backdrop-filter cria camada própria)
 * ela ficava ATRÁS do cartão seguinte, por mais alto que fosse o z-index.
 */
export function Dica({
  titulo,
  texto,
  lado = 'baixo',
  alinhar = 'centro',
  children,
}: {
  titulo: string;
  texto?: string;
  lado?: 'cima' | 'baixo';
  alinhar?: 'centro' | 'fim';
  children: ReactNode;
}) {
  const ancora = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined);

  const mostrar = (atraso: number) => {
    clearTimeout(espera.current);
    espera.current = setTimeout(() => {
      const r = ancora.current?.getBoundingClientRect();
      if (!r) return;
      setPos({ x: alinhar === 'centro' ? r.left + r.width / 2 : r.right, y: lado === 'baixo' ? r.bottom + 8 : r.top - 8 });
    }, atraso);
  };
  const esconder = () => {
    clearTimeout(espera.current);
    setPos(null);
  };
  useEffect(() => () => clearTimeout(espera.current), []);
  // Rolou a página com a dica aberta: some, em vez de ficar flutuando no lugar errado.
  useEffect(() => {
    if (!pos) return;
    window.addEventListener('scroll', esconder, true);
    return () => window.removeEventListener('scroll', esconder, true);
  }, [pos]);

  return (
    <span
      ref={ancora}
      className="inline-flex"
      onMouseEnter={() => mostrar(180)}
      onMouseLeave={esconder}
      onFocus={() => mostrar(0)}
      onBlur={esconder}
    >
      {children}
      {createPortal(
        <AnimatePresence>
          {pos && (
            <motion.span
              aria-hidden
              initial={{ opacity: 0, y: lado === 'baixo' ? -4 : 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: EASE }}
              className="pointer-events-none fixed z-[200] block w-max max-w-64 rounded-xl border border-borda-forte bg-card-forte px-3.5 py-2.5 text-left shadow-card backdrop-blur-xl"
              style={{
                left: pos.x,
                top: pos.y,
                translate: `${alinhar === 'centro' ? '-50%' : '-100%'} ${lado === 'baixo' ? '0' : '-100%'}`,
              }}
            >
              <span className="block text-[13px] font-semibold leading-snug text-fg">{titulo}</span>
              {texto && <span className="mt-0.5 block text-xs leading-relaxed text-fg-2">{texto}</span>}
            </motion.span>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </span>
  );
}

// ── Tema ────────────────────────────────────────────────────────────────────

function temaAtual(): 'claro' | 'escuro' {
  return document.documentElement.dataset.tema === 'claro' ? 'claro' : 'escuro';
}

export function AlternarTema({ className }: { className?: string }) {
  const [tema, setTema] = useState(temaAtual);

  useEffect(() => {
    if (tema === 'claro') document.documentElement.dataset.tema = 'claro';
    else delete document.documentElement.dataset.tema;
    try {
      localStorage.setItem('monitoria:tema', tema);
    } catch {
      /* armazenamento indisponível: vale só nesta aba */
    }
  }, [tema]);

  const claro = tema === 'claro';
  return (
    <button
      type="button"
      onClick={() => setTema(claro ? 'escuro' : 'claro')}
      aria-label={claro ? 'Ativar modo escuro' : 'Ativar modo claro'}
      className={cx(
        'vidro grid size-10 place-items-center rounded-full text-fg-2 transition hover:scale-105 hover:text-fg active:scale-95',
        className,
      )}
    >
      {claro ? <Moon className="size-[18px]" aria-hidden /> : <Sun className="size-[18px]" aria-hidden />}
    </button>
  );
}
