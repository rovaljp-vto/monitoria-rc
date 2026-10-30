import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import { ArrowRight, FlaskConical, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useEu } from '@/lib/sessao';
import type { UsuarioDemo } from '@/lib/tipos';
import { AlternarTema, EASE, mensagemDeErro } from '@/components/ui';
import { Monograma } from '@/components/Marca';

/**
 * Tela de quem chega sem sessão — mesma linguagem da tela de acesso do FAC.
 *
 * Não existe formulário de login: o acesso é SOMENTE pelo card do RovalConnecta
 * (SSO). Aqui só orientamos a pessoa a entrar por lá — depois de sair, por
 * inatividade, por revogação no hub ou por ter aberto o endereço direto.
 */
export function Entrar() {
  const [busca] = useSearchParams();
  const encerrada = busca.get('sessao') === 'encerrada';
  const eu = useEu();
  const config = useQuery({
    queryKey: ['config-publica'],
    queryFn: () => api.get<{ rovalConnectaUrl: string; demo: boolean }>('/api/publico/config'),
    staleTime: Infinity,
  });
  const reduzir = useReducedMotion();

  // Já tem sessão (voltou pelo histórico, por exemplo): vai direto para a home.
  if (eu.data) return <Navigate to="/" replace />;

  const cascata: Variants = { animate: { transition: { staggerChildren: 0.14, delayChildren: 0.1 } } };
  const item: Variants = reduzir
    ? { initial: {}, animate: {} }
    : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } } };

  const urlHub = config.data?.rovalConnectaUrl;

  return (
    <div className="fundo-hero relative min-h-dvh w-full overflow-hidden text-fg">
      <FundoGrade />
      <AlternarTema className="fixed right-4 top-4 z-20 lg:right-6" />

      <div className="relative grid min-h-dvh w-full grid-cols-1 lg:grid-cols-[58%_42%]">
        {/* Manifesto */}
        <motion.section
          variants={cascata}
          initial="initial"
          animate="animate"
          className="relative hidden flex-col justify-between py-14 pl-20 pr-12 lg:flex xl:py-20 xl:pl-32 xl:pr-20"
        >
          <motion.header variants={item} className="flex items-center gap-3 font-mono text-[10.5px] uppercase tracking-[0.22em] text-fg-3">
            <Monograma className="text-fg" />
            <span className="border-l border-borda-forte pl-3">Qualidade do atendimento</span>
          </motion.header>

          <motion.div variants={item} className="-mt-8">
            <h1 className="font-display text-[clamp(48px,6.2vw,104px)] font-semibold leading-[0.98] tracking-[-0.035em]">
              <span className="block">Checklist</span>
              <span className="block whitespace-nowrap">
                <PalavraDigitada palavras={['Comercial.', 'de Vendedores.', 'de Lojas.']} />
              </span>
            </h1>
            <p className="mt-8 max-w-[38ch] text-[15px] leading-relaxed text-fg-2">
              Avaliação do atendimento dos vendedores e do padrão das lojas, com nota, cobertura mensal e foco em quem
              precisa de acompanhamento.
            </p>
          </motion.div>

          <motion.footer variants={item} className="border-t border-borda pt-7 font-mono text-[10.5px] uppercase tracking-[0.18em]">
            <div className="text-fg-3">Integração</div>
            <div className="mt-1.5 text-fg">RovalConnectaJP</div>
          </motion.footer>
        </motion.section>

        {/* Acesso */}
        <section className="relative flex flex-col items-center justify-center gap-6 px-4 py-16 sm:px-10 lg:items-start lg:py-14 lg:pl-2 lg:pr-14 xl:pr-20">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em] text-fg-3 lg:hidden">
            <Monograma className="text-marca" />
            <span>Checklist Comercial</span>
          </div>

          <motion.div
            initial={reduzir ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.2 }}
            className="vidro group relative w-full max-w-[480px] rounded-md px-8 py-12 transition-[transform,border-color] duration-500 hover:-translate-y-1 hover:border-borda-forte sm:px-14 sm:py-16"
          >
            <div className="relative flex flex-col gap-7">
              <div className="flex items-center gap-2.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.22em] text-fg-2">
                <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${encerrada ? 'bg-regular' : 'bg-marca'}`} />
                {encerrada ? 'Sessão encerrada' : 'Acesso restrito'}
              </div>

              <h2 className="font-display text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[36px]">
                Entre pelo
                <span className="block bg-gradient-to-r from-marca to-acento bg-clip-text pb-[0.08em] text-transparent">
                  RovalConnecta
                </span>
              </h2>

              <p className="text-sm leading-relaxed text-fg-2">
                {encerrada
                  ? 'Sua sessão foi encerrada. Para continuar, abra o Checklist Comercial novamente a partir do RovalConnecta.'
                  : 'O acesso ao Checklist Comercial é feito somente a partir do RovalConnecta. Abra o RovalConnecta e entre no sistema por lá.'}
              </p>

              <a
                href={urlHub ?? '#'}
                aria-disabled={!urlHub}
                className="group/btn mt-1 inline-flex h-12 w-full items-center justify-between rounded-md bg-gradient-to-br from-marca to-marca-forte px-5 text-[13px] font-semibold uppercase tracking-[0.18em] text-white shadow-marca transition active:scale-[0.99]"
              >
                <span className="whitespace-nowrap">
                  <span className="hidden sm:inline">Ir para o </span>RovalConnecta
                </span>
                <ArrowRight className="size-4 transition-transform duration-300 group-hover/btn:translate-x-1" strokeWidth={2.4} aria-hidden />
              </a>
            </div>

            <div className="mt-9 flex justify-end border-t border-borda pt-5">
              <span className="bg-gradient-to-r from-marca to-acento bg-clip-text font-display text-xs font-semibold text-transparent">
                Checklist Comercial · RovalConnectaJP
              </span>
            </div>
          </motion.div>

          {config.data?.demo && <PortaDemo />}
        </section>
      </div>
    </div>
  );
}

/**
 * Porta de demonstração — só existe fora de produção com DEMO_LOGIN=true.
 * Não contorna nada: o servidor assina um token SSO e o fluxo real valida.
 */
function PortaDemo() {
  const usuarios = useQuery({
    queryKey: ['demo-usuarios'],
    queryFn: () => api.get<UsuarioDemo[]>('/api/demo/usuarios'),
  });
  const entrar = useMutation({
    mutationFn: (usuarioId: string) => api.post<{ url: string }>('/api/demo/entrar', { usuarioId }),
    onSuccess: ({ url }) => window.location.assign(url),
  });

  return (
    <div className="w-full max-w-[480px] rounded-md border border-dashed border-regular/40 bg-regular-bg/40 p-5">
      <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-regular">
        <FlaskConical className="size-4" aria-hidden /> Demonstração — entrar como
      </p>
      {entrar.error && <p className="mb-2 text-sm text-critico">{mensagemDeErro(entrar.error)}</p>}
      <ul className="flex flex-col gap-1.5">
        {usuarios.data?.map((u) => (
          <li key={u.id}>
            <button
              type="button"
              onClick={() => entrar.mutate(u.id)}
              disabled={entrar.isPending}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-card-hover disabled:opacity-50"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{u.nome}</span>
                <span className="block text-xs text-fg-3">{u.papel}</span>
              </span>
              {entrar.isPending && entrar.variables === u.id ? (
                <Loader2 className="size-4 animate-spin text-fg-3" aria-hidden />
              ) : (
                <ArrowRight className="size-4 text-fg-3" aria-hidden />
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FundoGrade() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(to right, var(--fg) 1px, transparent 1px), linear-gradient(to bottom, var(--fg) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />
      <div aria-hidden className="pointer-events-none absolute -left-40 top-1/3 size-[520px] rounded-full bg-marca/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 right-10 size-[420px] rounded-full bg-marca/10 blur-3xl" />
    </>
  );
}

/**
 * Palavra que se digita e se apaga em loop. A largura é reservada pela palavra
 * mais longa (texto invisível), então o título não "pula" enquanto digita.
 */
function PalavraDigitada({ palavras }: { palavras: string[] }) {
  const reduzir = useReducedMotion();
  const [texto, setTexto] = useState(palavras[0]);
  const [indice, setIndice] = useState(0);
  const [fase, setFase] = useState<'digitando' | 'pausa' | 'apagando'>('pausa');

  useEffect(() => {
    if (reduzir) return;
    const atual = palavras[indice];
    let t: ReturnType<typeof setTimeout>;
    if (fase === 'digitando') {
      t =
        texto.length < atual.length
          ? setTimeout(() => setTexto(atual.slice(0, texto.length + 1)), 130 + Math.random() * 70)
          : setTimeout(() => setFase('pausa'), 0);
    } else if (fase === 'pausa') {
      t = setTimeout(() => setFase('apagando'), 2200);
    } else if (texto.length > 0) {
      t = setTimeout(() => setTexto(texto.slice(0, -1)), 45);
    } else {
      t = setTimeout(() => {
        setIndice((i) => (i + 1) % palavras.length);
        setFase('digitando');
      }, 220);
    }
    return () => clearTimeout(t);
  }, [texto, fase, indice, palavras, reduzir]);

  return (
    <span className="relative inline-grid align-baseline">
      {palavras.map((p) => (
        <span key={p} aria-hidden className="invisible [grid-area:1/1]">
          {p}
        </span>
      ))}
      <span aria-hidden className="bg-gradient-to-r from-marca to-acento bg-clip-text pb-[0.08em] text-transparent [grid-area:1/1]">
        {reduzir ? palavras[0] : texto}
        {!reduzir && (
          <span aria-hidden className="ml-1 inline-block h-[0.8em] w-[3px] translate-y-[0.08em] animate-pulse bg-marca" />
        )}
      </span>
      <span className="sr-only">{palavras[0]}</span>
    </span>
  );
}
