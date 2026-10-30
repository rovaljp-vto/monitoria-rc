import { useParams, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FilterX } from 'lucide-react';
import { api } from '@/lib/api';
import { CANAIS, FAIXAS, MODULOS, ORDEM_FAIXAS } from '@/lib/modulos';
import { fmtMes, fmtNota, plural } from '@/lib/formato';
import type { Canal, Faixa, Slug } from '@/lib/tipos';
import { CarregandoTela, cx, ErroTela, Vazio } from '@/components/ui';
import { Cabecalho } from '@/components/Layout';
import { SeletorMes } from '@/components/SeletorMes';
import {
  CaixaDica,
  CartaoGrafico,
  EIXO,
  Indicador,
  LegendaMapa,
  MapaDeCalor,
  Tabela,
} from '@/components/graficos';

// ── Tipos da resposta ──────────────────────────────────────────────────────

interface Par {
  atual: number | null;
  anterior: number | null;
}
interface DadosDashboard {
  periodo: { meses: string[]; mesesSerie: string[]; anterior: { de: string; ate: string } };
  limites: { excelenteMin: number; bomMin: number; regularMin: number };
  kpis: {
    notaMedia: Par;
    conformidade: Par;
    monitorias: Par;
    cobertura: Par;
    emFoco: Par;
    feedback: Par;
    autoavaliacao: { diferencaMedia: number | null; feedbacks: number; acima: number; abaixo: number };
  };
  serie: { mes: string; monitorias: number; notaMedia: number | null; conformidade: number | null; cobertura: number | null; faixas: Record<Faixa, number> }[];
  criterios: { criterio: string; pctSim: number | null; aplicavel: number; porMes: Record<string, number | null> }[];
  lojas: {
    lojaId: string;
    nome: string;
    monitorias: number;
    notaMedia: number | null;
    conformidade: number | null;
    cobertura: number | null;
    porMes: Record<string, number | null>;
  }[];
  ranking: { id: string; nome: string; lojaNome: string; monitorias: number; notaMedia: number; faixa: Faixa; anterior: number | null; serie: (number | null)[] }[];
}

const COR_FAIXA: Record<Faixa, string> = {
  EXCELENTE: 'var(--excelente)',
  BOM: 'var(--bom)',
  REGULAR: 'var(--regular)',
  CRITICO: 'var(--critico)',
};

const PERIODOS = [1, 3, 6, 12] as const;

/**
 * Dashboard analítico — escopo §4.4 / §4.5.
 *
 * Leitura de cima para baixo, como painéis de monitoria de qualidade de
 * mercado: indicadores do período → tendência → onde falha (critérios) →
 * onde falha (lojas) → quem se destaca e quem precisa de atenção →
 * autoavaliação.
 *
 * Filtros numa linha só, acima de tudo, e na URL (link compartilhável). Como no
 * Power BI, clicar numa loja filtra o painel inteiro.
 */
export default function Dashboard() {
  const slug = useParams().modulo as Slug;
  const m = MODULOS[slug];
  const ehVendedor = slug === 'vendedores';
  const [busca, setBusca] = useSearchParams();

  const mesAtualLocal = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
  const ate = /^\d{4}-\d{2}$/.test(busca.get('ate') ?? '') ? (busca.get('ate') as string) : mesAtualLocal;
  const meses = [3, 6, 12].includes(Number(busca.get('meses'))) ? Number(busca.get('meses')) : 1;
  const lojaId = busca.get('loja') ?? '';
  const canal = (busca.get('canal') ?? '') as Canal | '';

  function filtrar(chave: string, valor: string | null) {
    const n = new URLSearchParams(busca);
    if (valor) n.set(chave, valor);
    else n.delete(chave);
    setBusca(n, { replace: true });
  }

  const q = useQuery({
    queryKey: ['dashboard', slug, ate, meses, lojaId, canal],
    queryFn: () => api.get<DadosDashboard>(`/api/modulos/${slug}/dashboard`, { ate, meses, lojaId, canal }),
    // Sem piscar ao trocar filtro: segura o gráfico anterior esmaecido.
    placeholderData: keepPreviousData,
  });

  const d = q.data;
  const lojaNome = d?.lojas.find((l) => l.lojaId === lojaId)?.nome;
  const filtrosAtivos = Boolean(lojaId || canal);

  return (
    <>
      <Cabecalho
        sobre={m.titulo}
        titulo="Dashboard"
        descricao={
          d
            ? `${meses === 1 ? fmtMes(d.periodo.meses[0]) : `${fmtMes(d.periodo.meses[0])} a ${fmtMes(d.periodo.meses[d.periodo.meses.length - 1])}`}${lojaNome ? ` · ${lojaNome}` : ''}${canal ? ` · ${CANAIS[canal]}` : ''}. ${meses === 1 ? `Variações comparadas a ${fmtMes(d.periodo.anterior.de)}; gráficos de tendência mostram os últimos 6 meses.` : `Variações comparadas aos ${meses} meses anteriores.`}`
            : undefined
        }
      />

      {/* Filtros — uma linha, acima de tudo que eles afetam. */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-borda bg-card p-1" role="group" aria-label="Período">
          {PERIODOS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => filtrar('meses', p === 1 ? null : String(p))}
              aria-pressed={meses === p}
              className={cx('rounded-lg px-3 py-1.5 text-xs font-semibold transition', meses === p ? 'bg-marca text-white shadow-marca' : 'text-fg-2 hover:text-fg')}
            >
              {p === 1 ? 'Mês atual' : `${p} meses`}
            </button>
          ))}
        </div>
        <SeletorMes mes={ate} onChange={(novo) => filtrar('ate', novo === mesAtualLocal ? null : novo)} />
        <label>
          <span className="sr-only">Loja</span>
          <select className="campo w-44 py-2" value={lojaId} onChange={(e) => filtrar('loja', e.target.value || null)}>
            <option value="">Todas as lojas</option>
            {d?.lojas.map((l) => (
              <option key={l.lojaId} value={l.lojaId}>
                {l.nome}
              </option>
            ))}
          </select>
        </label>
        {ehVendedor && (
          <div className="flex rounded-xl border border-borda bg-card p-1" role="group" aria-label="Canal">
            {(['', 'BALCAO', 'WHATSAPP'] as const).map((c) => (
              <button
                key={c || 'todos'}
                type="button"
                onClick={() => filtrar('canal', c || null)}
                aria-pressed={canal === c}
                className={cx('rounded-lg px-3 py-1.5 text-xs font-semibold transition', canal === c ? 'bg-card-hover text-fg shadow-sm' : 'text-fg-3 hover:text-fg')}
              >
                {c ? CANAIS[c] : 'Todos os canais'}
              </button>
            ))}
          </div>
        )}
        {filtrosAtivos && (
          <button
            type="button"
            onClick={() => {
              const n = new URLSearchParams(busca);
              n.delete('loja');
              n.delete('canal');
              setBusca(n, { replace: true });
            }}
            className="flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-fg-2 transition hover:bg-card hover:text-fg"
          >
            <FilterX className="size-4" aria-hidden /> Limpar filtros
          </button>
        )}
      </div>

      {q.isPending ? (
        <CarregandoTela linhas={6} />
      ) : q.error || !d ? (
        <ErroTela erro={q.error} onTentar={() => q.refetch()} />
      ) : d.kpis.monitorias.atual === 0 ? (
        <Vazio titulo="Sem monitorias neste recorte">Mude o período ou limpe os filtros.</Vazio>
      ) : (
        <div className={cx('flex flex-col gap-5 transition-opacity', q.isPlaceholderData && 'opacity-60')}>
          <Indicadores d={d} ehVendedor={ehVendedor} />
          <Ranking d={d} slug={slug} />
          <div className="grid gap-5 xl:grid-cols-5">
            <Evolucao d={d} className="xl:col-span-3" />
            <FaixasPorMes d={d} className="xl:col-span-2" />
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <CriteriosQueFalham d={d} />
            <ComparativoLojas d={d} lojaId={lojaId} ehVendedor={ehVendedor} />
          </div>
          {/* O mapa de calor ganha a largura inteira: com 7 critérios + média,
              meia tela cortava a última coluna. */}
          <CriteriosPorMes d={d} />
          {ehVendedor && <Percepcao d={d} />}
        </div>
      )}
    </>
  );
}

// ── Seções ─────────────────────────────────────────────────────────────────

function Indicadores({ d, ehVendedor }: { d: DadosDashboard; ehVendedor: boolean }) {
  const k = d.kpis;
  return (
    <div className={cx('grid grid-cols-2 gap-3 md:grid-cols-3', ehVendedor ? 'xl:grid-cols-6' : 'xl:grid-cols-5')}>
      <Indicador rotulo="Nota média" valor={k.notaMedia.atual} anterior={k.notaMedia.anterior} serie={d.serie.map((s) => s.notaMedia)} destaque />
      <Indicador rotulo="Conformidade (% de Sim)" valor={k.conformidade.atual} sufixo="%" anterior={k.conformidade.anterior} serie={d.serie.map((s) => s.conformidade)} />
      <Indicador rotulo="Cobertura do último mês" valor={k.cobertura.atual} sufixo="%" anterior={k.cobertura.anterior} serie={d.serie.map((s) => s.cobertura)} />
      <Indicador rotulo="Monitorias" valor={k.monitorias.atual} anterior={k.monitorias.anterior || null} serie={d.serie.map((s) => s.monitorias)} />
      <Indicador rotulo="Em Regular ou Crítico" valor={k.emFoco.atual} sufixo="%" anterior={k.emFoco.anterior} bomQuandoSobe={false} serie={d.serie.map((s) => {
        const t = ORDEM_FAIXAS.reduce((a, f) => a + s.faixas[f], 0);
        return t ? ((s.faixas.REGULAR + s.faixas.CRITICO) / t) * 100 : null;
      })} />
      {ehVendedor && <Indicador rotulo="Com feedback dado" valor={k.feedback.atual} sufixo="%" anterior={k.feedback.anterior} detalhe="das monitorias do período" />}
    </div>
  );
}

function Evolucao({ d, className }: { d: DadosDashboard; className?: string }) {
  const dados = d.serie.map((s) => ({ ...s, rotulo: fmtMes(s.mes, true) }));
  const comNota = dados.filter((s) => s.notaMedia !== null);
  const ultimo = comNota[comNota.length - 1];
  const min = Math.max(0, Math.floor(Math.min(d.limites.regularMin, ...comNota.map((s) => s.notaMedia as number)) / 10) * 10 - 10);
  return (
    <CartaoGrafico
      className={className}
      titulo="Evolução da nota média"
      subtitulo={`Linhas de referência: Bom a partir de ${d.limites.bomMin}, Regular a partir de ${d.limites.regularMin}`}
      tabela={<Tabela cabecalho={['Mês', 'Monitorias', 'Nota média', '% Sim', 'Cobertura %']} linhas={d.serie.map((s) => [fmtMes(s.mes), s.monitorias, s.notaMedia, s.conformidade, s.cobertura])} />}
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dados} margin={{ top: 16, right: 44, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grade)" />
            <XAxis dataKey="rotulo" tick={EIXO} axisLine={false} tickLine={false} />
            <YAxis domain={[min, 100]} tick={EIXO} axisLine={false} tickLine={false} width={40} />
            <ReferenceLine y={d.limites.bomMin} stroke="var(--bom)" strokeOpacity={0.6} label={{ value: 'Bom', position: 'insideTopLeft', fill: 'var(--fg-3)', fontSize: 11 }} />
            <ReferenceLine y={d.limites.regularMin} stroke="var(--critico)" strokeOpacity={0.5} label={{ value: 'Regular', position: 'insideTopLeft', fill: 'var(--fg-3)', fontSize: 11 }} />
            <Tooltip
              cursor={{ stroke: 'var(--borda-forte)' }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <CaixaDica
                    titulo={fmtMes((payload[0].payload as { mes: string }).mes)}
                    linhas={[
                      { cor: 'var(--serie-1)', rotulo: 'Nota média', valor: fmtNota(payload[0].payload.notaMedia) },
                      { rotulo: 'Monitorias', valor: String(payload[0].payload.monitorias) },
                      { rotulo: '% de Sim', valor: `${fmtNota(payload[0].payload.conformidade)}%` },
                    ]}
                  />
                ) : null
              }
            />
            <Line
              type="monotone"
              dataKey="notaMedia"
              stroke="var(--serie-1)"
              strokeWidth={2}
              connectNulls
              dot={{ r: 4, fill: 'var(--serie-1)', stroke: 'var(--bg)', strokeWidth: 2 }}
              activeDot={{ r: 6, stroke: 'var(--bg)', strokeWidth: 2 }}
            >
              {/* Rótulo só no fim da linha — nunca um número em cada ponto. */}
              <LabelList
                dataKey="notaMedia"
                content={({ x, y, index }) =>
                  ultimo && dados[index as number]?.mes === ultimo.mes ? (
                    <text x={Number(x) + 10} y={Number(y) + 4} fill="var(--fg)" fontSize={12} fontWeight={600}>
                      {fmtNota(ultimo.notaMedia)}
                    </text>
                  ) : null
                }
              />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </CartaoGrafico>
  );
}

function FaixasPorMes({ d, className }: { d: DadosDashboard; className?: string }) {
  // Mês sem nenhuma monitoria fica vazio (a linha não "cai a zero" onde não houve avaliação).
  const dados = d.serie.map((s) => ({
    rotulo: fmtMes(s.mes, true),
    mes: s.mes,
    ...Object.fromEntries(ORDEM_FAIXAS.map((f) => [f, s.monitorias ? s.faixas[f] : null])),
  }));
  const ultimo = [...dados].reverse().find((x) => ORDEM_FAIXAS.some((f) => (x as Record<string, unknown>)[f] !== null));
  return (
    <CartaoGrafico
      className={className}
      titulo="Monitorias por faixa"
      subtitulo="Quantas monitorias caíram em cada faixa, mês a mês"
      tabela={<Tabela cabecalho={['Mês', ...ORDEM_FAIXAS.map((f) => FAIXAS[f].rotulo)]} linhas={d.serie.map((s) => [fmtMes(s.mes), ...ORDEM_FAIXAS.map((f) => s.faixas[f])])} />}
    >
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dados} margin={{ top: 12, right: 28, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grade)" />
            <XAxis dataKey="rotulo" tick={EIXO} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={EIXO} axisLine={false} tickLine={false} width={36} />
            <Tooltip
              cursor={{ stroke: 'var(--borda-forte)' }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <CaixaDica
                    titulo={fmtMes((payload[0].payload as { mes: string }).mes)}
                    linhas={ORDEM_FAIXAS.map((f) => ({
                      cor: COR_FAIXA[f],
                      rotulo: FAIXAS[f].rotulo,
                      valor: String((payload[0].payload as Record<string, number | null>)[f] ?? '—'),
                    }))}
                  />
                ) : null
              }
            />
            {ORDEM_FAIXAS.map((f) => (
              <Line
                key={f}
                type="monotone"
                dataKey={f}
                name={FAIXAS[f].rotulo}
                stroke={COR_FAIXA[f]}
                strokeWidth={2}
                dot={{ r: 4, fill: COR_FAIXA[f], stroke: 'var(--bg)', strokeWidth: 2 }}
                activeDot={{ r: 6, stroke: 'var(--bg)', strokeWidth: 2 }}
              >
                {/* Rótulo só no último ponto de cada linha. */}
                <LabelList
                  dataKey={f}
                  content={({ x, y, index, value }) =>
                    ultimo && dados[index as number]?.mes === ultimo.mes && value !== null && value !== undefined ? (
                      <text x={Number(x) + 8} y={Number(y) + 4} fill="var(--fg-2)" fontSize={11} fontWeight={600}>
                        {String(value)}
                      </text>
                    ) : null
                  }
                />
              </Line>
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Legenda itens={ORDEM_FAIXAS.map((f) => ({ cor: COR_FAIXA[f], rotulo: FAIXAS[f].rotulo }))} />
    </CartaoGrafico>
  );
}

function CriteriosQueFalham({ d, className }: { d: DadosDashboard; className?: string }) {
  const dados = [...d.criterios].filter((c) => c.pctSim !== null).sort((a, b) => (a.pctSim as number) - (b.pctSim as number));
  const pior = dados[0];
  return (
    <CartaoGrafico
      className={className}
      titulo="Onde mais falha"
      subtitulo={pior ? `Critério mais fraco: ${pior.criterio} (${fmtNota(pior.pctSim)}% de Sim)` : undefined}
      tabela={<Tabela cabecalho={['Critério', '% de Sim', 'Avaliações']} linhas={dados.map((c) => [c.criterio, c.pctSim, c.aplicavel])} />}
    >
      <div style={{ height: Math.max(220, dados.length * 52) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} layout="vertical" margin={{ top: 0, right: 44, bottom: 0, left: 0 }} barCategoryGap="30%">
            <CartesianGrid horizontal={false} stroke="var(--grade)" />
            <XAxis type="number" domain={[0, 100]} tick={EIXO} axisLine={false} tickLine={false} unit="%" />
            <YAxis type="category" dataKey="criterio" width={210} tick={<RotuloCriterio />} axisLine={false} tickLine={false} interval={0} />
            <ReferenceLine x={d.limites.bomMin} stroke="var(--fg-3)" strokeOpacity={0.5} />
            <Tooltip
              cursor={{ fill: 'var(--card-hover)' }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <CaixaDica
                    titulo={(payload[0].payload as { criterio: string }).criterio}
                    linhas={[
                      { cor: 'var(--serie-1)', rotulo: '% de Sim', valor: `${fmtNota(payload[0].payload.pctSim)}%` },
                      { rotulo: 'Avaliações', valor: String(payload[0].payload.aplicavel) },
                    ]}
                  />
                ) : null
              }
            />
            <Bar dataKey="pctSim" maxBarSize={20} radius={[0, 4, 4, 0]}>
              {/* Ênfase: abaixo da meta na cor da série, o resto recua para o cinza. */}
              {dados.map((c) => (
                <Cell key={c.criterio} fill={(c.pctSim as number) < d.limites.bomMin ? 'var(--serie-1)' : 'var(--borda-forte)'} />
              ))}
              <LabelList dataKey="pctSim" position="right" formatter={(v: unknown) => `${fmtNota(Number(v))}%`} fill="var(--fg-2)" fontSize={11} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] text-fg-3">Em azul, abaixo da meta de {d.limites.bomMin}% · linha vertical = meta</p>
    </CartaoGrafico>
  );
}

/**
 * Nome do critério no eixo: legível (13px, cor de texto principal) e quebrado
 * em até duas linhas por palavra — o rótulo padrão do recharts espremia em três.
 */
function RotuloCriterio({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const palavras = String(payload?.value ?? '').split(' ');
  const linhas: string[] = [''];
  for (const p of palavras) {
    const atual = linhas[linhas.length - 1];
    if ((atual + ' ' + p).trim().length > 26 && atual && linhas.length < 2) linhas.push(p);
    else linhas[linhas.length - 1] = (atual + ' ' + p).trim();
  }
  if (linhas[1] && linhas[1].length > 26) linhas[1] = `${linhas[1].slice(0, 25)}…`;
  return (
    <text x={Number(x) - 10} y={Number(y)} textAnchor="end" fill="var(--fg)" fontSize={13} fontWeight={500}>
      {linhas.map((l, i) => (
        <tspan key={i} x={Number(x) - 10} dy={i === 0 ? (linhas.length > 1 ? -3 : 4) : 15}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

function CriteriosPorMes({ d, className }: { d: DadosDashboard; className?: string }) {
  return (
    <CartaoGrafico
      className={className}
      titulo="Critério × mês"
      subtitulo="O ponto fraco é sempre o mesmo, ou está mudando?"
      tabela={<Tabela cabecalho={['Critério', ...d.periodo.mesesSerie.map((m) => fmtMes(m, true))]} linhas={d.criterios.map((c) => [c.criterio, ...d.periodo.mesesSerie.map((m) => c.porMes[m])])} />}
    >
      <MapaDeCalor
        rotuloLinha="Critério"
        linhas={d.criterios.map((c) => ({ id: c.criterio, rotulo: c.criterio }))}
        colunas={d.periodo.mesesSerie.map((m) => ({ id: m, rotulo: fmtMes(m, true) }))}
        valor={(l, c) => d.criterios.find((x) => x.criterio === l)?.porMes[c] ?? null}
        limites={d.limites}
      />
      <LegendaMapa limites={d.limites} />
    </CartaoGrafico>
  );
}

function ComparativoLojas({
  d,
  lojaId,
  ehVendedor,
  className,
}: {
  d: DadosDashboard;
  lojaId: string;
  ehVendedor: boolean;
  className?: string;
}) {
  // TODAS as lojas: uma loja sem monitoria no período aparece como "sem monitoria"
  // em vez de sumir do gráfico (sumir dava a impressão de que ela não existe).
  const dados = [...d.lojas].sort((a, b) => (b.notaMedia ?? -1) - (a.notaMedia ?? -1));
  const semMonitoria = dados.filter((l) => l.notaMedia === null).length;
  return (
    <CartaoGrafico
      className={className}
      titulo={ehVendedor ? 'Nota média dos vendedores por loja' : 'Nota média por loja'}
      subtitulo={semMonitoria ? `${plural(semMonitoria, 'loja sem monitoria', 'lojas sem monitoria')} no período` : 'Nota média no período · linha = meta Bom'}
      tabela={<Tabela cabecalho={['Loja', 'Nota média', '% Sim', 'Cobertura %', 'Monitorias']} linhas={d.lojas.map((l) => [l.nome, l.notaMedia, l.conformidade, l.cobertura, l.monitorias])} />}
    >
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} margin={{ top: 22, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke="var(--grade)" />
            <XAxis
              dataKey="nome"
              axisLine={false}
              tickLine={false}
              interval={0}
              height={40}
              tick={({ x, y, payload }) => {
                const nome = String(payload.value);
                const semNota = dados.find((l) => l.nome === nome)?.notaMedia === null;
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text y={12} textAnchor="middle" fill="var(--fg-2)" fontSize={11} fontWeight={600}>
                      {nome.length > 14 ? `${nome.slice(0, 13)}…` : nome}
                    </text>
                    {semNota && (
                      <text y={27} textAnchor="middle" fill="var(--fg-3)" fontSize={10}>
                        sem monitoria
                      </text>
                    )}
                  </g>
                );
              }}
            />
            <YAxis domain={[0, 100]} tick={EIXO} axisLine={false} tickLine={false} width={40} />
            <ReferenceLine y={d.limites.bomMin} stroke="var(--bom)" strokeOpacity={0.6} label={{ value: 'meta Bom', position: 'insideTopRight', fill: 'var(--fg-3)', fontSize: 10 }} />
            <Tooltip
              cursor={{ fill: 'var(--card-hover)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const l = payload[0].payload as DadosDashboard['lojas'][number];
                return (
                  <CaixaDica
                    titulo={l.nome}
                    linhas={[
                      { cor: 'var(--serie-1)', rotulo: 'Nota média', valor: fmtNota(l.notaMedia) },
                      { rotulo: '% de Sim', valor: `${fmtNota(l.conformidade)}%` },
                      { rotulo: 'Cobertura (último mês)', valor: l.cobertura === null ? '—' : `${fmtNota(l.cobertura)}%` },
                      { rotulo: 'Monitorias', valor: String(l.monitorias) },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="notaMedia" maxBarSize={48} radius={[4, 4, 0, 0]} minPointSize={(v) => (v === 0 ? 3 : 0)}>
              {dados.map((l) => (
                <Cell key={l.lojaId} fill={!lojaId || l.lojaId === lojaId ? 'var(--serie-1)' : 'var(--borda-forte)'} />
              ))}
              <LabelList dataKey="notaMedia" position="top" formatter={(v: unknown) => fmtNota(Number(v))} fill="var(--fg)" fontSize={12} fontWeight={600} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </CartaoGrafico>
  );
}

/**
 * Ranking em barras horizontais — nome e loja no eixo, nota na ponta, cor da
 * faixa (com a legenda por nome). Só leitura: o detalhe de cada pessoa fica
 * na Cobertura e no histórico.
 */
function Ranking({ d, slug }: { d: DadosDashboard; slug: Slug }) {
  const ehVendedor = slug === 'vendedores';
  const n = ehVendedor ? 5 : 3;
  const melhores = d.ranking.slice(0, n);
  const piores = [...d.ranking].reverse().slice(0, n).filter((r) => !melhores.some((m) => m.id === r.id));

  const Grafico = ({ itens, titulo, subtitulo }: { itens: DadosDashboard['ranking']; titulo: string; subtitulo: string }) => {
    const dados = itens.map((r) => ({ ...r, eixo: ehVendedor ? `${r.nome}|${r.lojaNome}` : r.nome }));
    return (
      <CartaoGrafico
        titulo={titulo}
        subtitulo={subtitulo}
        tabela={<Tabela cabecalho={['Nome', 'Loja', 'Nota', 'Período anterior', 'Monitorias']} linhas={itens.map((r) => [r.nome, r.lojaNome, r.notaMedia, r.anterior, r.monitorias])} />}
      >
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados} margin={{ top: 22, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke="var(--grade)" />
              <XAxis
                dataKey="eixo"
                axisLine={false}
                tickLine={false}
                interval={0}
                height={42}
                tick={({ x, y, payload }) => {
                  const [nome, loja] = String(payload.value).split('|');
                  const curto = nome.split(' ').slice(0, 2).join(' ');
                  return (
                    <g transform={`translate(${x},${y})`}>
                      <text y={12} textAnchor="middle" fill="var(--fg)" fontSize={12} fontWeight={600}>
                        {curto.length > 16 ? `${curto.slice(0, 15)}…` : curto}
                      </text>
                      {loja && (
                        <text y={27} textAnchor="middle" fill="var(--fg-3)" fontSize={10}>
                          {loja}
                        </text>
                      )}
                    </g>
                  );
                }}
              />
              <YAxis domain={[0, 100]} tick={EIXO} axisLine={false} tickLine={false} width={40} />
              <ReferenceLine y={d.limites.bomMin} stroke="var(--fg-3)" strokeOpacity={0.4} />
              <Tooltip
                cursor={{ fill: 'var(--card-hover)' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const r = payload[0].payload as DadosDashboard['ranking'][number];
                  return (
                    <CaixaDica
                      titulo={r.nome}
                      linhas={[
                        { cor: COR_FAIXA[r.faixa], rotulo: `Nota média · ${FAIXAS[r.faixa].rotulo}`, valor: fmtNota(r.notaMedia) },
                        { rotulo: 'Período anterior', valor: r.anterior === null ? 'sem nota' : fmtNota(r.anterior) },
                        { rotulo: 'Monitorias', valor: String(r.monitorias) },
                      ]}
                    />
                  );
                }}
              />
              <Bar dataKey="notaMedia" maxBarSize={48} radius={[4, 4, 0, 0]} minPointSize={(v) => (v === 0 ? 3 : 0)}>
                {dados.map((r) => (
                  <Cell key={r.id} fill={COR_FAIXA[r.faixa]} />
                ))}
                <LabelList dataKey="notaMedia" position="top" formatter={(v: unknown) => fmtNota(Number(v))} fill="var(--fg)" fontSize={12} fontWeight={600} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <Legenda itens={ORDEM_FAIXAS.filter((f) => itens.some((r) => r.faixa === f)).map((f) => ({ cor: COR_FAIXA[f], rotulo: FAIXAS[f].rotulo }))} />
      </CartaoGrafico>
    );
  };

  const alvo = ehVendedor ? 'vendedores' : 'lojas';
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Grafico itens={melhores} titulo={`Destaques — ${n} melhores ${alvo}`} subtitulo="Nota média no período" />
      {piores.length > 0 ? <Grafico itens={piores} titulo={`Precisam de atenção — ${piores.length} menores notas`} subtitulo="Nota média no período · linha = meta Bom" /> : <div />}
    </div>
  );
}

function Percepcao({ d }: { d: DadosDashboard }) {
  const a = d.kpis.autoavaliacao;
  return (
    <CartaoGrafico titulo="Autoavaliação × nota da monitoria" subtitulo="Nos feedbacks em que a pessoa disse que nota se daria">
      {a.feedbacks === 0 ? (
        <p className="py-8 text-center text-sm text-fg-3">Ainda não há feedbacks com autoavaliação no período.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-card-hover p-4">
            <span className="block text-3xl font-semibold">
              {(a.diferencaMedia ?? 0) > 0 ? '+' : ''}
              {fmtNota(a.diferencaMedia)}
            </span>
            <span className="mt-1 block text-xs text-fg-3">diferença média (0–10)</span>
          </div>
          <div className="rounded-xl bg-card-hover p-4">
            <span className="block text-3xl font-semibold">{a.acima}</span>
            <span className="mt-1 block text-xs text-fg-3">se avaliaram acima</span>
          </div>
          <div className="rounded-xl bg-card-hover p-4">
            <span className="block text-3xl font-semibold">{a.abaixo}</span>
            <span className="mt-1 block text-xs text-fg-3">se avaliaram abaixo</span>
          </div>
          <p className="col-span-3 text-xs text-fg-3">
            {a.feedbacks} feedback(s) com autoavaliação. Positivo = a pessoa se deu nota maior que a da monitoria.
          </p>
        </div>
      )}
    </CartaoGrafico>
  );
}

function Legenda({ itens }: { itens: { cor: string; rotulo: string }[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-2">
      {itens.map((i) => (
        <li key={i.rotulo} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: i.cor }} aria-hidden />
          {i.rotulo}
        </li>
      ))}
    </ul>
  );
}
