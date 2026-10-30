import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChartColumn, CheckCircle2, Circle, PlusCircle, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { MODULOS } from '@/lib/modulos';
import { pode, useEu } from '@/lib/sessao';
import { fmtDiaMes, plural } from '@/lib/formato';
import type { Cobertura as TCobertura, ItemCobertura, Slug } from '@/lib/tipos';
import { Aviso, Barra, Botao, CarregandoTela, cx, ErroTela, Nota, Rotulo, SeloFaixa, Vazio } from '@/components/ui';
import { Cabecalho } from '@/components/Layout';
import { SeletorMes, useMesDaUrl } from '@/components/SeletorMes';

type FiltroStatus = 'todos' | 'pendentes' | 'avaliados';

/** Escopo §4.2 / §4.5 — o painel "quem falta" do mês. */
export default function Cobertura() {
  const slug = useParams().modulo as Slug;
  const m = MODULOS[slug];
  const { data: eu } = useEu();
  const [busca, setBusca] = useSearchParams();
  const [mes, setMes] = useMesDaUrl(busca, setBusca);
  const [status, setStatus] = useState<FiltroStatus>('todos');
  const [texto, setTexto] = useState('');

  const q = useQuery({
    queryKey: ['cobertura', slug, mes],
    queryFn: () => api.get<TCobertura>(`/api/modulos/${slug}/cobertura`, { mes }),
  });

  const itens = useMemo(() => {
    const t = texto.trim().toLocaleLowerCase('pt-BR');
    return (q.data?.itens ?? []).filter(
      (i) =>
        (status === 'todos' || (status === 'pendentes' ? !i.avaliado : i.avaliado)) &&
        (!t || i.nome.toLocaleLowerCase('pt-BR').includes(t)),
    );
  }, [q.data, status, texto]);

  const podeRegistrar = pode(eu, m.perm.registrar);

  return (
    <>
      <Cabecalho
        sobre={m.titulo}
        titulo="Cobertura do mês"
        descricao={`${slug === 'vendedores' ? 'Todo(a) vendedor(a) ativo(a)' : 'Toda loja ativa'} precisa de pelo menos uma monitoria no mês-calendário. Quem ainda falta aparece como pendente.`}
        acoes={
          <>
            <SeletorMes mes={mes} onChange={setMes} />
            <Link to={`/${slug}/dashboard`}>
              <Botao variante="fantasma" icone={<ChartColumn className="size-4" aria-hidden />}>
                Dashboard
              </Botao>
            </Link>
            {podeRegistrar && (
              <Link to={`/${slug}/nova`}>
                <Botao icone={<PlusCircle className="size-4" aria-hidden />}>Nova monitoria</Botao>
              </Link>
            )}
          </>
        }
      />

      {q.isPending ? (
        <CarregandoTela />
      ) : q.error ? (
        <ErroTela erro={q.error} onTentar={() => q.refetch()} />
      ) : (
        <div className="flex flex-col gap-6">
          {q.data.resumo.alertaFimDeMes && (
            <Aviso tipo="alerta" titulo={`Fim de mês: ${plural(q.data.resumo.pendentes, `${m.alvo} pendente`, `${m.alvos} pendentes`)}`}>
              {q.data.resumo.diasRestantes === 0
                ? 'Hoje é o último dia do mês.'
                : `Restam ${plural(q.data.resumo.diasRestantes ?? 0, 'dia', 'dias')} para fechar a cobertura.`}{' '}
              Os pendentes estão destacados em vermelho.
            </Aviso>
          )}

          <section aria-labelledby="lista-cobertura">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 id="lista-cobertura" className="flex items-baseline gap-2">
                <Rotulo>{m.curto} do mês</Rotulo>
                <span className="num text-xs text-fg-3">
                  {q.data.resumo.avaliados} de {q.data.resumo.total} avaliados
                </span>
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {slug === 'vendedores' && (
                  <label className="relative">
                    <span className="sr-only">Buscar por nome</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
                    <input
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      placeholder="Buscar nome"
                      className="campo w-44 py-2 pl-9"
                    />
                  </label>
                )}
                <div className="flex rounded-xl border border-borda bg-card p-1" role="group" aria-label="Situação">
                  {(['todos', 'pendentes', 'avaliados'] as FiltroStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      aria-pressed={status === s}
                      className={cx(
                        'rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition',
                        status === s ? 'bg-card-hover text-fg shadow-sm' : 'text-fg-3 hover:text-fg',
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {itens.length === 0 ? (
              <Vazio titulo={q.data.itens.length ? 'Nada com esses filtros' : `Nenhum(a) ${m.alvo} ativo(a) neste mês`}>
                {q.data.itens.length ? 'Mude a situação ou a busca.' : 'Os cadastros são mantidos na Administração.'}
              </Vazio>
            ) : slug === 'vendedores' ? (
              <QuadroPorLoja itens={itens} porLoja={q.data.porLoja} slug={slug} destacarPendente={q.data.resumo.alertaFimDeMes} />
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
                {itens.map((i) => (
                  <CartaoCobertura key={i.id} item={i} slug={slug} destacarPendente={q.data.resumo.alertaFimDeMes} />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}

/**
 * Quadro estilo kanban: uma coluna por loja, com o progresso da loja no topo.
 * Pendentes primeiro — é o que precisa de ação. Em telas estreitas as colunas
 * rolam na horizontal.
 */
function QuadroPorLoja({
  itens,
  porLoja,
  slug,
  destacarPendente,
}: {
  itens: ItemCobertura[];
  porLoja: TCobertura['porLoja'];
  slug: Slug;
  destacarPendente: boolean;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
      <div className="flex min-w-max gap-4 xl:min-w-0">
        {porLoja.map((l) => {
          const daLoja = itens
            .filter((i) => i.lojaId === l.lojaId)
            .sort((a, b) => Number(a.avaliado) - Number(b.avaliado) || a.nome.localeCompare(b.nome, 'pt-BR'));
          const pct = l.total ? (l.avaliados / l.total) * 100 : 0;
          const completo = l.total > 0 && l.avaliados === l.total;
          return (
            <section key={l.lojaId} aria-label={l.lojaNome} className="flex w-72 shrink-0 flex-col rounded-2xl border border-borda bg-card/60 xl:w-auto xl:min-w-0 xl:flex-1">
              <header className="sticky top-0 flex flex-col gap-2 rounded-t-2xl border-b border-borda p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate font-semibold">{l.lojaNome}</h3>
                  <span className={cx('num shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold', completo ? 'bg-excelente-bg text-excelente' : 'bg-card-hover text-fg-2')}>
                    {l.avaliados}/{l.total}
                  </span>
                </div>
                <Barra valor={pct} />
                <p className={cx('text-xs', completo ? 'text-excelente' : 'text-fg-3')}>
                  {completo ? 'Loja concluída no mês' : plural(l.total - l.avaliados, 'pendente', 'pendentes')}
                </p>
              </header>
              <ul className="flex flex-col gap-2 p-2">
                {daLoja.length === 0 ? (
                  <li className="px-2 py-6 text-center text-xs text-fg-3">Ninguém com esse filtro.</li>
                ) : (
                  daLoja.map((i) => <CartaoCobertura key={i.id} item={i} slug={slug} destacarPendente={destacarPendente} compacto />)
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function CartaoCobertura({ item: i, slug, destacarPendente, compacto }: { item: ItemCobertura; slug: Slug; destacarPendente: boolean; compacto?: boolean }) {
  return (
    <li>
      <Link
        to={`/${slug}/alvo/${i.id}`}
        className={cx(
          'vidro flex flex-col gap-2.5 rounded-xl p-3.5 transition hover:-translate-y-0.5 hover:border-borda-forte',
          !i.avaliado && destacarPendente && 'border-critico/40 bg-critico-bg/40',
        )}
      >
        <div className="flex items-start gap-2.5">
          {i.avaliado ? (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-excelente" aria-label="Avaliado" />
          ) : (
            <Circle className={cx('mt-0.5 size-5 shrink-0', destacarPendente ? 'text-critico' : 'text-fg-3')} aria-label="Pendente" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium leading-snug">{i.nome}</span>
            <span className="block truncate text-xs text-fg-3">
              {!compacto && slug === 'vendedores' && `${i.lojaNome} · `}
              {i.avaliado ? `Avaliado em ${fmtDiaMes(i.ultimaData as string)}` : 'Pendente'}
            </span>
          </span>
          <Nota nota={i.mediaMes} faixa={i.faixaMes} className="text-lg leading-tight" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {i.faixaMes && <SeloFaixa faixa={i.faixaMes} tamanho="sm" />}
          {i.emFoco && (
            <span className="rounded-full bg-regular-bg px-2 py-0.5 text-[11px] font-semibold text-regular">em foco</span>
          )}
          <span className="num ml-auto text-[11px] text-fg-3">
            {i.monitorias}/{i.metaMes} monitorias
          </span>
        </div>
      </Link>
    </li>
  );
}
