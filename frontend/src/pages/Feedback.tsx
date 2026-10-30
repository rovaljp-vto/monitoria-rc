import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { animate, AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Eye,
  Flag,
  Maximize,
  MessageSquareText,
  Minimize,
  Minus,
  Quote,
  Repeat,
  Sparkles,
  TrendingDown,
  Trophy,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { CANAIS, FAIXAS, slugDoTipo } from '@/lib/modulos';
import { fmtData, fmtMes, fmtNota, iniciais } from '@/lib/formato';
import type { Faixa, Feedback as TFeedback, HistoricoAlvo, MonitoriaDetalhe } from '@/lib/tipos';
import { Aviso, Botao, CarregandoTela, cx, Dica, EASE, ErroTela, mensagemDeErro } from '@/components/ui';
import { Monograma } from '@/components/Marca';
import { AreaComImagens, Galeria } from '@/components/Imagens';
import { reduzirImagem } from '@/lib/imagens';

/**
 * Apresentação do feedback — a monitora mostra a monitoria para a vendedora,
 * muitas vezes dias depois do atendimento.
 *
 * O roteiro segue como a conversa acontece: primeiro o atendimento e os
 * critérios, depois a pergunta "que nota você se daria?", e só então a nota da
 * monitoria aparece, com a comparação. Com "Ocultar nota" ligado (padrão), nada
 * na tela entrega a nota antes da revelação.
 */

type Etapa = 'abertura' | 'criterios' | 'autoavaliacao' | 'revelacao' | 'evolucao' | 'fechamento';

const ROTULO_ETAPA: Record<Etapa, string> = {
  abertura: 'Atendimento',
  criterios: 'Critérios',
  autoavaliacao: 'Sua nota',
  revelacao: 'Resultado',
  evolucao: 'Evolução',
  fechamento: 'Combinados',
};

const COR_FAIXA: Record<Faixa, string> = {
  EXCELENTE: 'var(--excelente)',
  BOM: 'var(--bom)',
  REGULAR: 'var(--regular)',
  CRITICO: 'var(--critico)',
};

export default function Feedback() {
  const { id } = useParams();
  const navigate = useNavigate();
  const reduzir = useReducedMotion();
  const cliente = useQueryClient();

  const q = useQuery({
    queryKey: ['monitoria', id],
    queryFn: () => api.get<MonitoriaDetalhe>(`/api/monitorias/${id}`),
  });
  const d = q.data;
  const slug = d ? slugDoTipo(d.tipo) : null;
  const alvoId = d ? (d.vendedor?.id ?? d.loja.id) : null;
  const historico = useQuery({
    queryKey: ['alvo', slug, alvoId],
    queryFn: () => api.get<HistoricoAlvo>(`/api/modulos/${slug}/alvos/${alvoId}`),
    enabled: Boolean(slug && alvoId),
  });

  // A nota fica SEMPRE oculta até a revelação — é a dinâmica da conversa.
  const ocultar = true;
  const [revelada, setRevelada] = useState(false);
  const [autoavaliacao, setAutoavaliacao] = useState<number | null>(null); // 0–10
  const [textos, setTextos] = useState({ pontosFortes: '', pontosMelhorar: '', combinados: '' });
  const [preenchido, setPreenchido] = useState(false);
  const [indice, setIndice] = useState(0);
  const [direcao, setDirecao] = useState(1);
  const [telaCheia, setTelaCheia] = useState(false);

  // Sugestões iniciais a partir das respostas: a monitora só edita.
  useEffect(() => {
    if (!d || preenchido) return;
    const lista = (r: MonitoriaDetalhe['respostas']) => r.map((x) => `• ${x.pergunta}${x.observacao ? ` — ${x.observacao}` : ''}`).join('\n');
    setTextos({
      pontosFortes: lista(d.respostas.filter((r) => r.resposta === 'SIM')),
      pontosMelhorar: lista(d.respostas.filter((r) => r.resposta === 'NAO')),
      combinados: '',
    });
    setPreenchido(true);
  }, [d, preenchido]);

  // Aparece sempre que o histórico carregou — na primeira monitoria, com a mensagem de ponto de partida.
  const temEvolucao = (historico.data?.monitorias.length ?? 0) > 0;
  const etapas = useMemo<Etapa[]>(
    () => [
      'abertura',
      'criterios',
      ...(ocultar ? (['autoavaliacao'] as Etapa[]) : []),
      'revelacao',
      ...(temEvolucao ? (['evolucao'] as Etapa[]) : []),
      'fechamento',
    ],
    [ocultar, temEvolucao],
  );
  const etapa = etapas[Math.min(indice, etapas.length - 1)];
  // Sem ocultar, a nota não é segredo: já nasce revelada.
  const notaVisivel = !ocultar || revelada;

  const ir = useCallback(
    (novo: number) => {
      const alvo = Math.max(0, Math.min(etapas.length - 1, novo));
      setDirecao(alvo >= indice ? 1 : -1);
      setIndice(alvo);
    },
    [etapas.length, indice],
  );

  // ← → navegam; não quando a pessoa está digitando.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (alvo.closest('textarea, input, select, [contenteditable]')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') ir(indice + 1);
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') ir(indice - 1);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [indice, ir]);

  useEffect(() => {
    const mudou = () => setTelaCheia(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', mudou);
    return () => document.removeEventListener('fullscreenchange', mudou);
  }, []);

  const alternarTelaCheia = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  const [imagens, setImagens] = useState<File[]>([]);
  const salvar = useMutation({
    mutationFn: async () => {
      const fb = await api.post<TFeedback>(`/api/monitorias/${id}/feedbacks`, {
        ...(autoavaliacao !== null ? { autoavaliacao: autoavaliacao * 10 } : {}),
        ...(textos.pontosFortes.trim() ? { pontosFortes: textos.pontosFortes.trim() } : {}),
        ...(textos.pontosMelhorar.trim() ? { pontosMelhorar: textos.pontosMelhorar.trim() } : {}),
        ...(textos.combinados.trim() ? { combinados: textos.combinados.trim() } : {}),
        ...(imagens.length ? { comImagens: true } : {}),
      });
      if (imagens.length) {
        const reduzidas = await Promise.all(imagens.map(reduzirImagem));
        await api.arquivos(`/api/feedbacks/${fb.id}/imagens`, 'imagens', reduzidas);
      }
      return fb;
    },
    onSettled: () => cliente.invalidateQueries({ queryKey: ['monitoria', id] }),
  });

  if (q.isPending) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <CarregandoTela />
      </div>
    );
  }
  if (q.error || !d) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <ErroTela erro={q.error} onTentar={() => q.refetch()} />
      </div>
    );
  }

  if (d.tipo !== 'VENDEDOR') return <Navigate to={`/monitoria/${d.id}`} replace />;

  const nome = d.vendedor?.nome ?? d.loja.nome;
  const primeiroNome = nome.split(' ')[0];
  const ehVendedor = d.tipo === 'VENDEDOR';
  const variantes = {
    entra: (dir: number) => (reduzir ? { opacity: 0 } : { opacity: 0, x: dir * 60 }),
    centro: { opacity: 1, x: 0 },
    sai: (dir: number) => (reduzir ? { opacity: 0 } : { opacity: 0, x: dir * -60 }),
  };

  return (
    <div className="fundo-hero relative flex min-h-dvh flex-col overflow-hidden text-fg">
      {/* Grade sutil ao fundo — a mesma assinatura da tela de acesso. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(to right, var(--fg) 1px, transparent 1px), linear-gradient(to bottom, var(--fg) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      {/* Barra superior */}
      <header className="relative z-10 flex items-center gap-4 px-4 py-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-2.5">
          <Monograma className="size-7 text-fg" />
          <span className="hidden font-display text-lg font-semibold sm:block">Feedback</span>
        </div>

        <nav aria-label="Etapas" className="mx-auto hidden items-center gap-1 md:flex">
          {etapas.map((e, i) => (
            <button
              key={e}
              type="button"
              onClick={() => ir(i)}
              aria-current={i === indice ? 'step' : undefined}
              className={cx(
                'flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition',
                i === indice ? 'bg-marca text-white shadow-marca' : i < indice ? 'text-fg-2 hover:text-fg' : 'text-fg-3 hover:text-fg-2',
              )}
            >
              <span className={cx('num grid size-5 place-items-center rounded-full text-[10px]', i === indice ? 'bg-white/20' : 'bg-card-hover')}>
                {i < indice ? <Check className="size-3" aria-hidden /> : i + 1}
              </span>
              {ROTULO_ETAPA[e]}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <Dica titulo={telaCheia ? 'Sair da tela cheia' : 'Tela cheia'} texto="Para apresentar num monitor ou TV." alinhar="fim">
            <button
              type="button"
              onClick={alternarTelaCheia}
              className="grid size-10 place-items-center rounded-full border border-borda bg-card text-fg-2 transition hover:text-fg"
              aria-label={telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
            >
              {telaCheia ? <Minimize className="size-4" aria-hidden /> : <Maximize className="size-4" aria-hidden />}
            </button>
          </Dica>
          <Dica titulo="Fechar apresentação" texto="Volta para a tela da monitoria. Nada é salvo sem clicar em Registrar feedback." alinhar="fim">
            <button
              type="button"
              onClick={() => {
                if (document.fullscreenElement) document.exitFullscreen();
                navigate(`/monitoria/${d.id}`);
              }}
              className="grid size-10 place-items-center rounded-full border border-borda bg-card text-fg-2 transition hover:text-fg"
              aria-label="Fechar apresentação"
            >
              <X className="size-4" aria-hidden />
            </button>
          </Dica>
        </div>
      </header>

      {/* Palco */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-6 sm:px-10">
        <AnimatePresence mode="wait" custom={direcao} initial={false}>
          <motion.section
            key={etapa}
            custom={direcao}
            variants={variantes}
            initial="entra"
            animate="centro"
            exit="sai"
            transition={{ duration: 0.45, ease: EASE }}
            className="w-full max-w-6xl"
            aria-live="polite"
          >
            {etapa === 'abertura' && (
              <Abertura d={d} nome={nome} ehVendedor={ehVendedor} notaVisivel={notaVisivel} />
            )}
            {etapa === 'criterios' && <Criterios d={d} notaVisivel={notaVisivel} historico={historico.data} />}
            {etapa === 'autoavaliacao' && (
              <Autoavaliacao primeiroNome={primeiroNome} ehVendedor={ehVendedor} valor={autoavaliacao} onValor={setAutoavaliacao} />
            )}
            {etapa === 'revelacao' && (
              <Revelacao d={d} revelada={notaVisivel} onRevelar={() => setRevelada(true)} autoavaliacao={autoavaliacao} primeiroNome={primeiroNome} />
            )}
            {etapa === 'evolucao' && historico.data && <Evolucao h={historico.data} atualId={d.id} />}
            {etapa === 'fechamento' && (
              <Fechamento
                d={d}
                textos={textos}
                onTextos={setTextos}
                salvar={salvar}
                autoavaliacao={autoavaliacao}
                imagens={imagens}
                onImagens={setImagens}
              />
            )}
          </motion.section>
        </AnimatePresence>
      </main>

      {/* Navegação inferior */}
      <footer className="relative z-10 flex items-center justify-between gap-3 px-4 pb-6 sm:px-8">
        <Botao variante="fantasma" onClick={() => ir(indice - 1)} disabled={indice === 0} icone={<ArrowLeft className="size-4" aria-hidden />}>
          <span className="hidden sm:inline">Voltar</span>
        </Botao>
        <div className="flex items-center gap-1.5 md:hidden" aria-hidden>
          {etapas.map((e, i) => (
            <span key={e} className={cx('h-1.5 rounded-full transition-all', i === indice ? 'w-6 bg-marca' : 'w-1.5 bg-borda-forte')} />
          ))}
        </div>
        <p className="hidden text-xs text-fg-3 md:block">Use as setas ← → do teclado para avançar</p>
        {indice < etapas.length - 1 ? (
          <Botao onClick={() => ir(indice + 1)}>
            {etapa === 'autoavaliacao' && autoavaliacao === null ? 'Pular' : 'Avançar'}
            <ArrowRight className="size-4" aria-hidden />
          </Botao>
        ) : (
          <Link to={`/monitoria/${d.id}`}>
            <Botao variante="fantasma">Concluir</Botao>
          </Link>
        )}
      </footer>
    </div>
  );
}

// ── Etapas ──────────────────────────────────────────────────────────────────

function Titulo({ sobre, children }: { sobre: string; children: React.ReactNode }) {
  return (
    <div className="mb-8 text-center">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-marca-texto">{sobre}</p>
      <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">{children}</h1>
    </div>
  );
}

function Abertura({ d, nome, ehVendedor, notaVisivel }: { d: MonitoriaDetalhe; nome: string; ehVendedor: boolean; notaVisivel: boolean }) {
  const reduzir = useReducedMotion();
  return (
    <div className="flex flex-col items-center text-center">
      <motion.div
        initial={reduzir ? false : { scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.7, ease: EASE }}
        className="relative mb-8 grid size-36 place-items-center rounded-full sm:size-44"
        style={{ background: 'conic-gradient(from 200deg, var(--marca), var(--acento), var(--marca))' }}
      >
        <span className="grid size-[calc(100%-10px)] place-items-center rounded-full bg-bg font-display text-5xl font-semibold sm:text-6xl">
          {iniciais(nome)}
        </span>
      </motion.div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-marca-texto">
        {ehVendedor ? 'Monitoria de atendimento' : 'Monitoria de loja'}
      </p>
      <h1 className="font-display text-5xl font-semibold tracking-tight sm:text-7xl">{nome}</h1>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {[
          ehVendedor ? d.loja.nome : null,
          d.canal ? CANAIS[d.canal] : null,
          `${ehVendedor ? 'Atendimento' : 'Visita'} de ${fmtData(d.dataReferencia)}`,
          `Avaliado por ${d.avaliador}`,
        ]
          .filter(Boolean)
          .map((t) => (
            <span key={t} className="vidro rounded-full px-4 py-2 text-sm text-fg-2">
              {t}
            </span>
          ))}
        {notaVisivel && (
          <span className={cx('rounded-full px-4 py-2 text-sm font-semibold', FAIXAS[d.faixa].fundo, FAIXAS[d.faixa].cor)}>
            Nota {fmtNota(d.nota)}
          </span>
        )}
      </div>
      {d.feedbacks.length > 0 && (
        <p className="mt-6 text-xs text-fg-3">
          Já houve {d.feedbacks.length} feedback(s) sobre esta monitoria — o último em {fmtData(d.feedbacks[d.feedbacks.length - 1].realizadoEm)}.
        </p>
      )}
    </div>
  );
}

interface HistoricoCriterio {
  /** Da mais antiga para a mais recente; a última é a desta monitoria. */
  pontos: { id: string; data: string; resposta: 'SIM' | 'NAO' | 'NA'; atual: boolean }[];
  /** Quantas vezes seguidas terminou em "Não", contando esta. */
  naoSeguidos: number;
}

/** Histórico de cada critério (pelo texto) até a monitoria apresentada. */
function historicoPorCriterio(h: HistoricoAlvo | undefined, d: MonitoriaDetalhe): Map<string, HistoricoCriterio> {
  const mapa = new Map<string, HistoricoCriterio>();
  if (!h) return mapa;
  const ordem = [...h.monitorias].sort((a, b) => a.dataReferencia.localeCompare(b.dataReferencia));
  const ate = ordem.findIndex((m) => m.id === d.id);
  const janela = ordem.slice(Math.max(0, ate - 5), ate + 1); // até 6 pontos: 5 anteriores + esta
  for (const r of d.respostas) {
    const pontos = janela
      .map((m) => ({ id: m.id, data: m.dataReferencia, resposta: m.respostas.find((x) => x.criterio === r.pergunta)?.resposta, atual: m.id === d.id }))
      .filter((p): p is HistoricoCriterio['pontos'][number] => Boolean(p.resposta));
    let naoSeguidos = 0;
    for (let i = pontos.length - 1; i >= 0 && pontos[i].resposta === 'NAO'; i--) naoSeguidos++;
    mapa.set(r.pergunta, { pontos, naoSeguidos });
  }
  return mapa;
}

function Criterios({ d, notaVisivel, historico }: { d: MonitoriaDetalhe; notaVisivel: boolean; historico?: HistoricoAlvo }) {
  const reduzir = useReducedMotion();
  const [aberto, setAberto] = useState<string | null>(null);
  const hist = useMemo(() => historicoPorCriterio(historico, d), [historico, d]);
  const aplicaveis = d.respostas.filter((r) => r.resposta !== 'NA');
  const atendidos = aplicaveis.filter((r) => r.resposta === 'SIM').length;
  const pesoTotal = d.respostas.reduce((s, r) => s + r.pesoOriginal, 0) || 1;

  // "Onde melhorar" primeiro: é a conversa que importa; depois o que foi bem.
  const grupos: { titulo: string; tom: 'ruim' | 'bom' | 'neutro'; itens: MonitoriaDetalhe['respostas'] }[] = [
    { titulo: 'Onde melhorar', tom: 'ruim' as const, itens: d.respostas.filter((r) => r.resposta === 'NAO') },
    { titulo: 'O que foi bem', tom: 'bom' as const, itens: d.respostas.filter((r) => r.resposta === 'SIM') },
    { titulo: 'Não se aplicou neste atendimento', tom: 'neutro' as const, itens: d.respostas.filter((r) => r.resposta === 'NA') },
  ].filter((g) => g.itens.length);

  let ordem = 0;
  return (
    <div>
      <Titulo sobre="Critério a critério">
        {atendidos} de {aplicaveis.length} critérios atendidos
      </Titulo>

      {/* Uma pílula por critério, na largura do peso dele na nota. */}
      <div className="mx-auto mb-8 max-w-3xl">
        <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" aria-hidden>
          {d.respostas.map((r) => (
            <motion.span
              key={r.pergunta}
              initial={reduzir ? false : { scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.6, ease: EASE }}
              style={{ width: `${(r.pesoOriginal / pesoTotal) * 100}%`, transformOrigin: 'left' }}
              className={cx('h-full', r.resposta === 'SIM' ? 'bg-excelente' : r.resposta === 'NAO' ? 'bg-critico' : 'bg-borda-forte')}
            />
          ))}
        </div>
        <p className="mt-2 flex flex-wrap justify-center gap-x-4 text-xs text-fg-3">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-excelente" aria-hidden /> atendido</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-critico" aria-hidden /> a melhorar</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-borda-forte" aria-hidden /> não se aplica</span>
          <span>· largura = peso do critério na nota · clique num card para ver os detalhes</span>
        </p>
      </div>

      <div className="flex flex-col gap-7">
        {grupos.map((g) => (
          <section key={g.titulo} aria-label={g.titulo}>
            <h2 className={cx('mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em]', g.tom === 'ruim' ? 'text-critico' : g.tom === 'bom' ? 'text-excelente' : 'text-fg-3')}>
              {g.tom === 'ruim' ? <TrendingDown className="size-4" aria-hidden /> : g.tom === 'bom' ? <Trophy className="size-4" aria-hidden /> : <Minus className="size-4" aria-hidden />}
              {g.titulo} <span className="font-normal text-fg-3">({g.itens.length})</span>
            </h2>
            <ul className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.itens.map((r) => (
                <CartaoCriterio
                  key={r.pergunta}
                  r={r}
                  pesoPct={(r.pesoOriginal / pesoTotal) * 100}
                  hist={hist.get(r.pergunta)}
                  notaVisivel={notaVisivel}
                  aberto={aberto === r.pergunta}
                  onAlternar={() => setAberto((a) => (a === r.pergunta ? null : r.pergunta))}
                  atraso={0.06 * ordem++}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* Observações gerais e prints: a evidência que sustenta a conversa. */}
      {d.observacoes.length > 0 && (
        <motion.div
          initial={reduzir ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 * d.respostas.length + 0.1, duration: 0.45, ease: EASE }}
          className="mt-8"
        >
          <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.3em] text-fg-3">Observações e evidências</p>
          <div className="grid gap-3 md:grid-cols-2">
            {d.observacoes.map((o) => (
              <div key={o.id} className="vidro flex flex-col gap-3 rounded-2xl p-5">
                {o.texto && (
                  <p className="flex gap-2 text-sm leading-relaxed text-fg-2">
                    <Quote className="mt-0.5 size-3.5 shrink-0 text-marca-texto" aria-hidden />
                    <span className="whitespace-pre-wrap">{o.texto}</span>
                  </p>
                )}
                <Galeria ids={o.imagens} tamanho="lg" />
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

/**
 * Card de um critério. Fechado: o essencial (resultado, peso, histórico em
 * bolinhas). Clicado, expande com animação e mostra descrição, observação da
 * monitora, pontos na nota e o histórico com datas.
 */
function CartaoCriterio({
  r,
  pesoPct,
  hist,
  notaVisivel: _notaVisivel,
  aberto,
  onAlternar,
  atraso,
}: {
  r: MonitoriaDetalhe['respostas'][number];
  pesoPct: number;
  hist?: HistoricoCriterio;
  notaVisivel: boolean;
  aberto: boolean;
  onAlternar: () => void;
  atraso: number;
}) {
  const reduzir = useReducedMotion();
  const sim = r.resposta === 'SIM';
  const na = r.resposta === 'NA';
  const recorrente = (hist?.naoSeguidos ?? 0) >= 2;
  const anteriores = hist?.pontos.filter((p) => !p.atual) ?? [];

  return (
    <motion.li
      layout={!reduzir}
      initial={reduzir ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: atraso, duration: 0.45, ease: EASE, layout: { duration: 0.35, ease: EASE } }}
      className={cx(
        'vidro overflow-hidden rounded-2xl transition-shadow',
        sim && 'border-excelente/30',
        r.resposta === 'NAO' && 'border-critico/40',
        aberto && 'shadow-2xl ring-1 ring-borda-forte',
      )}
    >
      <button type="button" onClick={onAlternar} aria-expanded={aberto} className="flex w-full flex-col gap-3 p-5 text-left">
        <div className="flex items-start gap-3">
          <span
            className={cx(
              'grid size-11 shrink-0 place-items-center rounded-xl',
              sim ? 'bg-excelente-bg text-excelente' : na ? 'bg-card-hover text-fg-3' : 'bg-critico-bg text-critico',
            )}
          >
            {sim ? <Check className="size-5" aria-hidden /> : na ? <Minus className="size-5" aria-hidden /> : <X className="size-5" aria-hidden />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-snug">{r.pergunta}</p>
            <p className={cx('mt-0.5 text-xs font-medium', sim ? 'text-excelente' : na ? 'text-fg-3' : 'text-critico')}>
              {sim ? 'Atendido' : na ? 'Não se aplica' : 'Ponto a melhorar'}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 text-fg-3">
            {r.observacao && <MessageSquareText className="size-4 text-marca-texto" aria-label="Tem observação" />}
            <motion.span animate={{ rotate: aberto ? 180 : 0 }} transition={{ duration: 0.25 }} className="grid">
              <ChevronDown className="size-4" aria-hidden />
            </motion.span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-card-hover px-2.5 py-1 text-[11px] font-semibold text-fg-2">vale {fmtNota(pesoPct)}% da nota</span>
          {recorrente && (
            <span className="flex items-center gap-1 rounded-full bg-critico-bg px-2.5 py-1 text-[11px] font-semibold text-critico">
              <Repeat className="size-3" aria-hidden /> {hist!.naoSeguidos}ª vez seguida
            </span>
          )}
          {sim && anteriores.length > 0 && anteriores.every((p) => p.resposta !== 'NAO') && (
            <span className="flex items-center gap-1 rounded-full bg-excelente-bg px-2.5 py-1 text-[11px] font-semibold text-excelente">
              <Sparkles className="size-3" aria-hidden /> sempre em dia
            </span>
          )}
          {hist && hist.pontos.length > 1 && (
            <span className="ml-auto flex items-center gap-1" aria-hidden>
              {hist.pontos.map((p) => (
                <span
                  key={p.id}
                  className={cx(
                    'grid size-4 place-items-center rounded-full',
                    p.resposta === 'SIM' ? 'bg-excelente text-white' : p.resposta === 'NAO' ? 'bg-critico text-white' : 'bg-borda-forte',
                    p.atual && 'ring-2 ring-fg ring-offset-1 ring-offset-bg',
                  )}
                >
                  {p.resposta === 'SIM' ? <Check className="size-2.5" strokeWidth={3.5} /> : p.resposta === 'NAO' ? <X className="size-2.5" strokeWidth={3.5} /> : null}
                </span>
              ))}
            </span>
          )}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {aberto && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <div className="flex flex-col gap-4 border-t border-borda px-5 pb-5 pt-4">
              {/* A mensagem para a pessoa: o que ela fez bem ou o que pode melhorar. */}
              <p
                className={cx(
                  'rounded-xl border-l-4 px-4 py-3 text-[15px] leading-relaxed',
                  sim ? 'border-excelente bg-excelente-bg' : na ? 'border-borda-forte bg-card-hover' : 'border-critico bg-critico-bg',
                )}
              >
                {r.mensagem ??
                  (sim
                    ? `Você atendeu bem este ponto: ${r.pergunta.toLowerCase()}.`
                    : na
                      ? 'Este critério não se aplicou neste atendimento.'
                      : `Este é um ponto a melhorar: ${r.pergunta.toLowerCase()}.`)}
              </p>

              {r.descricao && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-3">O que se espera</p>
                  <p className="mt-1 text-sm text-fg-2">{r.descricao}</p>
                </div>
              )}

              {r.observacao && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-3">Observação da monitoria</p>
                  <p className="mt-1.5 flex gap-2 rounded-xl bg-card-hover px-3 py-2.5 text-sm leading-relaxed">
                    <Quote className="mt-0.5 size-3.5 shrink-0 text-marca-texto" aria-hidden />
                    <span className="whitespace-pre-wrap">{r.observacao}</span>
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

function Autoavaliacao({
  primeiroNome,
  ehVendedor,
  valor,
  onValor,
}: {
  primeiroNome: string;
  ehVendedor: boolean;
  valor: number | null;
  onValor: (v: number) => void;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <Titulo sobre={ehVendedor ? `E aí, ${primeiroNome}?` : 'Autoavaliação da loja'}>Que nota você daria para este atendimento?</Titulo>
      {/* Uma linha só a partir do tablet: 0 a 10 lado a lado, como uma régua. */}
      <div className="flex flex-wrap justify-center gap-2.5 sm:flex-nowrap sm:gap-3" role="radiogroup" aria-label="Nota de 0 a 10">
        {Array.from({ length: 11 }, (_, n) => {
          const ativo = valor === n;
          return (
            <motion.button
              key={n}
              type="button"
              role="radio"
              aria-checked={ativo}
              onClick={() => onValor(n)}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.94 }}
              className={cx(
                'num grid size-14 place-items-center rounded-2xl border font-display text-2xl font-semibold transition-colors sm:size-[clamp(52px,5.2vw,76px)] sm:text-3xl',
                ativo ? 'border-marca bg-gradient-to-br from-marca to-marca-forte text-white shadow-marca' : 'border-borda bg-card text-fg-2 hover:border-borda-forte hover:text-fg',
              )}
            >
              {n}
            </motion.button>
          );
        })}
      </div>
      <p className="mt-8 min-h-6 text-fg-2">
        {valor === null ? 'Escolha de 0 a 10.' :<>Anotado: <strong className="text-fg">{valor}</strong>. Vamos ver o resultado?</>}
      </p>
    </div>
  );
}

function Revelacao({
  d,
  revelada,
  onRevelar,
  autoavaliacao,
  primeiroNome,
}: {
  d: MonitoriaDetalhe;
  revelada: boolean;
  onRevelar: () => void;
  autoavaliacao: number | null;
  primeiroNome: string;
}) {
  const reduzir = useReducedMotion();
  const [exibida, setExibida] = useState(revelada && reduzir ? d.nota : 0);
  const iniciou = useRef(false);

  // Contagem de 0 até a nota: o momento da revelação.
  useEffect(() => {
    if (!revelada || iniciou.current) return;
    iniciou.current = true;
    if (reduzir) {
      setExibida(d.nota);
      return;
    }
    const controle = animate(0, d.nota, { duration: 1.8, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setExibida(v) });
    return () => controle.stop();
  }, [revelada, d.nota, reduzir]);

  const f = FAIXAS[d.faixa];
  const tamanho = 260;
  const r = (tamanho - 18) / 2;
  const c = 2 * Math.PI * r;

  if (!revelada) {
    return (
      <div className="flex flex-col items-center">
        <Titulo sobre="Resultado">Hora de comparar</Titulo>
        {/* Direto ao ponto: a autoavaliação já registrada de um lado, a nota da
            monitoria do outro — aparece quando a monitora clicar. */}
        <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2">
          <div className="vidro flex flex-col items-center gap-2 rounded-3xl p-8 text-center">
            <span className="text-sm font-medium text-fg-2">Autoavaliação de {primeiroNome}</span>
            <span className="text-7xl font-semibold leading-none">{autoavaliacao ?? '—'}</span>
            <span className="text-xs text-fg-3">{autoavaliacao === null ? 'não informada' : 'de 0 a 10'}</span>
          </div>
          <div className="vidro flex flex-col items-center justify-center gap-4 rounded-3xl p-8 text-center">
            <span className="text-sm font-medium text-fg-2">Nota da monitoria</span>
            <Botao onClick={onRevelar} className="min-h-12 px-6 text-base" icone={<Eye className="size-5" aria-hidden />}>
              Mostrar nota
            </Botao>
          </div>
        </div>
      </div>
    );
  }

  const monitoria10 = d.nota / 10;
  const diferenca = autoavaliacao === null ? null : Math.round((autoavaliacao - monitoria10) * 10) / 10;

  return (
    <div className="grid items-center gap-10 lg:grid-cols-2">
      <div className="flex flex-col items-center">
        <div className="relative grid place-items-center" style={{ width: tamanho, height: tamanho }}>
          <div aria-hidden className="absolute inset-6 rounded-full blur-3xl" style={{ background: COR_FAIXA[d.faixa], opacity: 0.18 }} />
          <svg width={tamanho} height={tamanho} className="-rotate-90" role="img" aria-label={`Nota ${fmtNota(d.nota)}, ${f.rotulo}`}>
            <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke="var(--borda)" strokeWidth={16} />
            <circle
              cx={tamanho / 2}
              cy={tamanho / 2}
              r={r}
              fill="none"
              stroke={COR_FAIXA[d.faixa]}
              strokeWidth={16}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c - (exibida / 100) * c}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <span className="num block font-display text-7xl font-semibold leading-none">{fmtNota(exibida)}</span>
              <span className="mt-2 block text-sm text-fg-3">de 100</span>
            </div>
          </div>
        </div>
        <motion.div
          initial={reduzir ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduzir ? 0 : 1.6, duration: 0.5, ease: EASE }}
          className="mt-6 flex flex-col items-center gap-2"
        >
          <span className={cx('rounded-full px-5 py-2 font-display text-2xl font-semibold', f.fundo, f.cor)}>{f.rotulo}</span>
          <span className="text-sm text-fg-2">{f.acao}</span>
        </motion.div>
      </div>

      <motion.div
        initial={reduzir ? false : { opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: reduzir ? 0 : 1.9, duration: 0.6, ease: EASE }}
        className="flex flex-col gap-6"
      >
        {autoavaliacao !== null ? (
          <>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {diferenca === 0
                ? 'Na mosca!'
                : Math.abs(diferenca ?? 0) <= 1
                  ? 'Percepção bem alinhada'
                  : (diferenca ?? 0) > 0
                    ? 'A autoavaliação foi mais alta'
                    : 'O atendimento foi melhor do que a autoavaliação'}
            </h2>
            <Comparacao rotulo={`Autoavaliação de ${primeiroNome}`} valor={autoavaliacao} cor="var(--serie-1)" atraso={2.1} />
            <Comparacao rotulo="Nota da monitoria" valor={monitoria10} cor={COR_FAIXA[d.faixa]} atraso={2.3} />
            <p className="text-sm text-fg-2">
              {diferenca === 0
                ? 'A nota que você se deu é exatamente a da monitoria.'
                : `Diferença de ${fmtNota(Math.abs(diferenca ?? 0))} ponto(s) na escala de 0 a 10.`}
            </p>
          </>
        ) : (
          <>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Resultado do atendimento</h2>
            <p className="text-fg-2">
              {d.respostas.filter((r) => r.resposta === 'SIM').length} critério(s) atendido(s) e{' '}
              {d.respostas.filter((r) => r.resposta === 'NAO').length} ponto(s) a melhorar.
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}

function Comparacao({ rotulo, valor, cor, atraso }: { rotulo: string; valor: number; cor: string; atraso: number }) {
  const reduzir = useReducedMotion();
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-medium text-fg-2">{rotulo}</span>
        <span className="num font-display text-4xl font-semibold">{fmtNota(valor)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-borda">
        <motion.div
          className="h-full rounded-full"
          style={{ background: cor }}
          initial={{ width: reduzir ? `${valor * 10}%` : 0 }}
          animate={{ width: `${valor * 10}%` }}
          transition={{ delay: reduzir ? 0 : atraso, duration: 0.9, ease: EASE }}
        />
      </div>
    </div>
  );
}

function Evolucao({ h, atualId }: { h: HistoricoAlvo; atualId: string }) {
  const reduzir = useReducedMotion();
  // Mais antigas à esquerda; as 10 mais recentes.
  const pontos = [...h.monitorias].reverse().slice(-10);
  // Só o que de fato escorrega: critério com 100% de "Sim" não é ponto fraco.
  const fracos = h.porCriterio
    .filter((c) => c.percentualSim !== null && c.percentualSim < 100)
    .sort((a, b) => (a.percentualSim ?? 0) - (b.percentualSim ?? 0))
    .slice(0, 3);

  if (pontos.length === 1) {
    const m = pontos[0];
    return (
      <div className="flex flex-col items-center text-center">
        <Titulo sobre="Evolução">Primeira monitoria</Titulo>
        <div className="vidro flex max-w-xl flex-col items-center gap-4 rounded-3xl p-10">
          <Flag className="size-10 text-marca-texto" aria-hidden />
          <p className="text-lg">
            Esta é a primeira monitoria registrada. A nota <strong className={FAIXAS[m.faixa].cor}>{fmtNota(m.nota)}</strong> vira o ponto de partida.
          </p>
          <p className="text-sm text-fg-2">Nas próximas conversas, esta tela mostra a evolução mês a mês e os critérios que mais se repetem.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Titulo sobre="Evolução">As últimas monitorias</Titulo>
      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="vidro rounded-3xl p-6">
          <div className="flex h-64 items-end gap-3" role="list" aria-label="Notas das últimas monitorias">
            {pontos.map((m, i) => {
              const atual = m.id === atualId;
              return (
                <div key={m.id} role="listitem" className="flex h-full flex-1 flex-col items-center justify-end gap-2" aria-label={`${fmtData(m.dataReferencia)}: ${fmtNota(m.nota)}`}>
                  <span className={cx('num text-sm font-semibold', FAIXAS[m.faixa].cor)}>{fmtNota(m.nota)}</span>
                  <motion.div
                    className={cx('w-full max-w-14 rounded-t-xl', FAIXAS[m.faixa].barra, !atual && 'opacity-45')}
                    initial={{ height: reduzir ? `${Math.max(4, m.nota)}%` : 0 }}
                    animate={{ height: `${Math.max(4, m.nota)}%` }}
                    transition={{ delay: reduzir ? 0 : 0.1 * i, duration: 0.7, ease: EASE }}
                    style={atual ? { boxShadow: `0 0 0 3px var(--bg), 0 0 0 5px ${COR_FAIXA[m.faixa]}` } : undefined}
                  />
                  <span className={cx('text-[11px]', atual ? 'font-semibold text-fg' : 'text-fg-3')}>{atual ? 'Esta' : fmtMes(m.mesRef, true)}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-fg-3">Onde mais escorrega</p>
          {fracos.length === 0 && (
            <div className="vidro flex items-center gap-3 rounded-2xl p-5">
              <Trophy className="size-6 shrink-0 text-excelente" aria-hidden />
              <p className="text-sm">Nenhum critério abaixo de 100% no histórico. Todos atendidos em todas as monitorias!</p>
            </div>
          )}
          {fracos.map((c) => (
            <div key={c.criterio} className="vidro rounded-2xl p-4">
              <div className="mb-2 flex justify-between gap-3">
                <span className="font-medium">{c.criterio}</span>
                <span className="num text-fg-2">{fmtNota(c.percentualSim)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-borda">
                <div className={cx('h-full rounded-full', (c.percentualSim ?? 0) >= 75 ? 'bg-excelente' : (c.percentualSim ?? 0) >= 50 ? 'bg-regular' : 'bg-critico')} style={{ width: `${c.percentualSim}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-fg-3">de "Sim" em {c.aplicavel} monitoria(s)</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Fechamento({
  d,
  textos,
  onTextos,
  salvar,
  autoavaliacao,
  imagens,
  onImagens,
}: {
  d: MonitoriaDetalhe;
  textos: { pontosFortes: string; pontosMelhorar: string; combinados: string };
  onTextos: (t: { pontosFortes: string; pontosMelhorar: string; combinados: string }) => void;
  salvar: { mutate: () => void; isPending: boolean; isSuccess: boolean; error: unknown };
  autoavaliacao: number | null;
  imagens: File[];
  onImagens: (a: File[]) => void;
}) {
  if (salvar.isSuccess) {
    return (
      <div className="flex flex-col items-center text-center">
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.6, ease: EASE }}>
          <CheckCircle2 className="size-20 text-excelente" aria-hidden />
        </motion.div>
        <h1 className="mt-6 font-display text-5xl font-semibold">Feedback registrado</h1>
        <p className="mt-3 max-w-lg text-fg-2">Fica guardado na monitoria, com a data de hoje{autoavaliacao !== null ? ' e a autoavaliação' : ''}.</p>
        <Link to={`/monitoria/${d.id}`} className="mt-8">
          <Botao>Voltar à monitoria</Botao>
        </Link>
      </div>
    );
  }

  const campos: { chave: keyof typeof textos; rotulo: string; dica: string; cor: string }[] = [
    { chave: 'pontosFortes', rotulo: 'Pontos fortes', dica: 'O que continuar fazendo', cor: 'border-t-excelente' },
    { chave: 'pontosMelhorar', rotulo: 'A melhorar', dica: 'O que ajustar no próximo atendimento', cor: 'border-t-critico' },
    { chave: 'combinados', rotulo: 'Combinados', dica: 'O que ficou acertado entre vocês', cor: 'border-t-marca' },
  ];

  return (
    <div>
      <Titulo sobre="Para fechar">O que fica desta conversa</Titulo>
      <div className="grid gap-4 lg:grid-cols-3">
        {campos.map((c) => (
          <label key={c.chave} className={cx('vidro flex flex-col gap-2 rounded-2xl border-t-4 p-5', c.cor)}>
            <span className="font-display text-xl font-semibold">{c.rotulo}</span>
            <span className="text-xs text-fg-3">{c.dica}</span>
            <textarea
              rows={7}
              maxLength={4000}
              value={textos[c.chave]}
              onChange={(e) => onTextos({ ...textos, [c.chave]: e.target.value })}
              className="campo mt-1 resize-y text-sm leading-relaxed"
              placeholder={c.chave === 'combinados' ? 'Ex.: nas próximas duas semanas, oferecer o complemento em todo atendimento de balcão.' : ''}
            />
          </label>
        ))}
      </div>
      {/* Imagens do feedback (ex.: print do que foi combinado, foto de exemplo). */}
      <div className="vidro mt-4 rounded-2xl p-5">
        <AreaComImagens arquivos={imagens} onArquivos={onImagens}>
          <p className="font-display text-xl font-semibold">
            Imagens <span className="font-sans text-xs font-normal text-fg-3">(opcional)</span>
          </p>
        </AreaComImagens>
      </div>
      <div className="mt-6 flex flex-col items-center gap-3">
        {salvar.error ? <Aviso>{mensagemDeErro(salvar.error)}</Aviso> : null}
        {d.podeObservar ? (
          <Botao onClick={() => salvar.mutate()} carregando={salvar.isPending} className="min-h-12 px-8 text-base">
            Registrar feedback
          </Botao>
        ) : (
          <p className="text-sm text-fg-3">Só quem registra monitorias deste módulo pode salvar o feedback.</p>
        )}
      </div>
    </div>
  );
}
