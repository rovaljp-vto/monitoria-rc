import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Lock, Settings2, Store, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { MODULOS, type ConfigModulo } from '@/lib/modulos';
import { pode, useEu } from '@/lib/sessao';
import { fmtMes, plural } from '@/lib/formato';
import { PERM, type Cobertura } from '@/lib/tipos';
import { AlternarTema, Barra, cx, EASE } from '@/components/ui';
import { MenuUsuario } from '@/components/Layout';
import { IlustracaoMonitoria } from '@/components/Ilustracao';

// "Roval" fixo; a segunda palavra troca em loop — mesma assinatura do Escuta.
const PALAVRAS = ['Avalia', 'Acompanha', 'Reconhece', 'Evolui', 'Connecta'];

/**
 * Home — escopo §4: dois cards separados, um por módulo. Mesma composição da
 * tela inicial do Roval Escuta (cards à esquerda, peça central, marca à direita).
 */
export function Inicio() {
  const { data: eu } = useEu();
  const navigate = useNavigate();
  const reduzir = useReducedMotion();
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    if (reduzir) return;
    const t = setInterval(() => setIndice((i) => (i + 1) % PALAVRAS.length), 3000);
    return () => clearInterval(t);
  }, [reduzir]);

  return (
    <div className="fundo-hero relative min-h-dvh overflow-hidden">
      <div className="fixed right-4 top-4 z-30 flex items-center gap-2 lg:right-6">
        <AlternarTema />
        <div className="vidro rounded-full py-0.5 pl-1 pr-0.5">
          <MenuUsuario />
        </div>
      </div>

      <IlustracaoMonitoria className="pointer-events-none absolute left-[37%] top-1/2 xl:left-[39%] 2xl:left-[41%] z-0 hidden w-[24vw] max-w-[440px] -translate-x-1/2 -translate-y-1/2 select-none lg:block" />

      <div className="relative z-10 flex min-h-dvh flex-col-reverse lg:flex-row">
        {/* Esquerda — módulos */}
        <aside className="flex flex-col justify-center px-4 pb-12 sm:px-6 lg:w-[40%] lg:py-10 lg:pl-[clamp(24px,15vw,300px)] lg:pr-4">
          <div className="mx-auto flex w-full max-w-[360px] flex-col gap-4 lg:mx-0">
            {Object.values(MODULOS).map((m, i) => (
              <CardModulo key={m.slug} modulo={m} liberado={pode(eu, m.perm.ver)} ordem={i} onAbrir={() => navigate(`/${m.slug}`)} />
            ))}

            {pode(eu, PERM.CADASTROS) && (
              <button
                type="button"
                onClick={() => navigate('/admin')}
                className="mt-1 inline-flex items-center gap-1.5 self-center rounded-lg px-2 py-1 text-xs text-fg-3 transition hover:text-fg"
              >
                <Settings2 className="size-3.5" aria-hidden /> Administração e cadastros
              </button>
            )}
          </div>
        </aside>

        {/* Direita — marca */}
        <main className="flex flex-col items-center justify-center px-6 pb-10 pt-24 text-center lg:w-[60%] lg:px-16 lg:py-12">
          <motion.div
            initial={reduzir ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="flex flex-col items-center"
          >
            <img src="/roval.png" alt="Roval" className="mb-3 h-auto w-[150px] object-contain lg:w-[clamp(150px,11vw,210px)]" />
            <h1 className="flex flex-col items-center">
              {/* Tamanho pela largura da tela: em notebook (1366px) um tamanho fixo
                  invadia a prancheta do centro. */}
              <span className="font-display text-5xl font-semibold leading-none tracking-[0.05em] sm:text-6xl lg:text-[clamp(3rem,4.6vw,6rem)]">
                CHECKLIST
              </span>
              <span className="mt-3 text-sm font-semibold uppercase tracking-[0.55em] text-marca-texto sm:text-base lg:mt-4 lg:text-lg">
                Comercial
              </span>
            </h1>

            <div
              className="my-7 h-px w-16"
              style={{ background: 'linear-gradient(90deg, transparent, var(--marca), transparent)' }}
            />

            <h2 className="flex items-baseline justify-center gap-3 font-display text-3xl tracking-tight lg:text-4xl">
              <span className="font-bold">Roval</span>
              <span className="relative grid justify-items-start overflow-hidden leading-[1.15]">
                {PALAVRAS.map((p) => (
                  <span key={p} aria-hidden className="invisible col-start-1 row-start-1 px-1 font-medium italic">
                    {p}
                  </span>
                ))}
                <AnimatePresence initial={false}>
                  <motion.span
                    key={PALAVRAS[indice]}
                    aria-hidden
                    initial={reduzir ? { opacity: 0 } : { y: '100%', opacity: 0 }}
                    animate={{ y: '0%', opacity: 1 }}
                    exit={reduzir ? { opacity: 0 } : { y: '-100%', opacity: 0 }}
                    transition={{ y: { duration: 0.8, ease: [0.33, 1, 0.68, 1] }, opacity: { duration: 0.55 } }}
                    className="col-start-1 row-start-1 px-1 font-medium italic text-acento will-change-transform"
                  >
                    {PALAVRAS[indice]}
                  </motion.span>
                </AnimatePresence>
                <span className="sr-only">Avalia</span>
              </span>
            </h2>

            <p className="mt-6 max-w-lg leading-relaxed text-fg-2">
              {eu ? <>Olá, {eu.nome.split(' ')[0]}. </> : null}A monitoria do atendimento dos vendedores e do padrão das
              lojas, com nota, cobertura do mês e foco em quem precisa de acompanhamento.
            </p>
          </motion.div>
        </main>
      </div>
    </div>
  );
}

function CardModulo({
  modulo,
  liberado,
  ordem,
  onAbrir,
}: {
  modulo: ConfigModulo;
  liberado: boolean;
  ordem: number;
  onAbrir: () => void;
}) {
  const reduzir = useReducedMotion();
  const cobertura = useQuery({
    queryKey: ['cobertura', modulo.slug, 'atual'],
    queryFn: () => api.get<Cobertura>(`/api/modulos/${modulo.slug}/cobertura`),
    enabled: liberado,
  });
  const Icone = modulo.tipo === 'VENDEDOR' ? Users : Store;
  const r = cobertura.data?.resumo;

  return (
    <motion.button
      type="button"
      onClick={onAbrir}
      disabled={!liberado}
      initial={reduzir ? false : { opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.1 + ordem * 0.08, ease: EASE }}
      className={cx(
        'group flex w-full flex-col gap-4 rounded-2xl border border-borda bg-card-forte px-6 py-5 text-left backdrop-blur-md transition',
        liberado ? 'hover:border-borda-forte hover:bg-card-hover active:scale-[0.99]' : 'cursor-not-allowed opacity-60',
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cx(
            'grid size-11 place-items-center rounded-xl',
            modulo.tipo === 'VENDEDOR' ? 'bg-marca-suave text-marca-texto' : 'bg-excelente-bg text-excelente',
          )}
        >
          <Icone className="size-5" aria-hidden />
        </span>
        {liberado ? (
          <ArrowRight className="size-4 text-fg-3 transition group-hover:translate-x-0.5 group-hover:text-marca" aria-hidden />
        ) : (
          <Lock className="size-4 text-fg-3" aria-hidden />
        )}
      </div>

      <div>
        <p className="font-semibold leading-snug">{modulo.titulo}</p>
        <p className="mt-1.5 text-sm leading-snug text-fg-2">
          {liberado
            ? modulo.tipo === 'VENDEDOR'
              ? 'Checklist de atendimento, cobertura mensal e foco por vendedor.'
              : 'Checklist da loja, visitas do mês e foco por loja.'
            : 'Sem acesso. Solicite a permissão ao administrador no RovalConnecta.'}
        </p>
      </div>

      {liberado && (
        <div className="flex flex-col gap-2" aria-live="polite">
          {r ? (
            <>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-fg-3 first-letter:uppercase">{fmtMes(cobertura.data!.mes)}</span>
                <span className="num font-semibold">
                  {r.avaliados}/{r.total} {modulo.tipo === 'VENDEDOR' ? 'avaliados' : 'avaliadas'}
                </span>
              </div>
              <Barra valor={r.cobertura} />
              {(r.emFoco > 0 || r.alertaFimDeMes) && (
                <p className="text-xs text-fg-3">
                  {r.emFoco > 0 && <span className="text-regular">{plural(r.emFoco, 'em foco', 'em foco')}</span>}
                  {r.emFoco > 0 && r.alertaFimDeMes && ' · '}
                  {r.alertaFimDeMes && <span className="text-critico">{r.pendentes} pendentes no fim do mês</span>}
                </p>
              )}
            </>
          ) : (
            <div className="h-7 animate-pulse rounded-md bg-card-hover" />
          )}
        </div>
      )}
    </motion.button>
  );
}
