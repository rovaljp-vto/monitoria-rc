import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Info, PlusCircle, Target } from 'lucide-react';
import { api } from '@/lib/api';
import { MODULOS } from '@/lib/modulos';
import { pode, useEu } from '@/lib/sessao';
import { fmtMes, plural } from '@/lib/formato';
import type { Foco as TFoco, Slug } from '@/lib/tipos';
import { Botao, CarregandoTela, Cartao, cx, ErroTela, Nota, SeloFaixa, Vazio } from '@/components/ui';
import { Cabecalho } from '@/components/Layout';
import { SeletorMes, useMesDaUrl } from '@/components/SeletorMes';

/** Escopo §4.3 / §4.5 — quem está em Regular ou Crítico e precisa de monitorias extras. */
export default function Foco() {
  const slug = useParams().modulo as Slug;
  const m = MODULOS[slug];
  const { data: eu } = useEu();
  const [busca, setBusca] = useSearchParams();
  const [mes, setMes] = useMesDaUrl(busca, setBusca);
  const q = useQuery({
    queryKey: ['foco', slug, mes],
    queryFn: () => api.get<TFoco>(`/api/modulos/${slug}/foco`, { mes }),
  });
  const registrar = pode(eu, m.perm.registrar);

  return (
    <>
      <Cabecalho
        sobre={m.titulo}
        titulo="Lista de foco"
        descricao={`${slug === 'vendedores' ? 'Vendedores' : 'Lojas'} com nota Regular ou Crítico, que precisam de mais acompanhamento neste mês.`}
        acoes={<SeletorMes mes={mes} onChange={setMes} />}
      />

      {/* As regras da lista, em etiquetas — no lugar de um parágrafo explicativo. */}
      {q.data && (
        <div className="-mt-2 mb-6 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-regular-bg px-3 py-1.5 font-medium text-regular">
            <span className="size-1.5 rounded-full bg-current" aria-hidden />
            Regular → {plural(q.data.metas.regular, 'monitoria', 'monitorias')} no mês
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-critico-bg px-3 py-1.5 font-medium text-critico">
            <span className="size-1.5 rounded-full bg-current" aria-hidden />
            Crítico → {plural(q.data.metas.critico, 'monitoria', 'monitorias')} no mês
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-card-hover px-3 py-1.5 text-fg-2">
            <Info className="size-3.5" aria-hidden />
            Ainda não avaliado no mês? Vale a última nota
          </span>
        </div>
      )}

      {q.isPending ? (
        <CarregandoTela />
      ) : q.error ? (
        <ErroTela erro={q.error} onTentar={() => q.refetch()} />
      ) : q.data.itens.length === 0 ? (
        <Vazio titulo="Ninguém em foco" icone={<Target className="size-5" aria-hidden />}>
          Nenhum(a) {m.alvo} com nota Regular ou Crítica em {fmtMes(mes)}.
        </Vazio>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {q.data.itens.map((i) => {
            const pct = Math.min(100, (i.realizadas / i.meta) * 100);
            return (
              <Cartao key={i.id} as="article" className={cx('flex flex-col gap-4 p-5', i.faixa === 'CRITICO' && 'border-critico/30')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/${slug}/alvo/${i.id}`} className="block truncate font-semibold hover:underline">
                      {i.nome}
                    </Link>
                    {slug === 'vendedores' && <p className="text-xs text-fg-3">{i.lojaNome}</p>}
                  </div>
                  <div className="text-right">
                    <Nota nota={i.nota} faixa={i.faixa} className="font-display text-3xl" />
                    <p className="text-[11px] text-fg-3">{i.origem === 'MES' ? 'média do mês' : 'última nota anterior'}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <SeloFaixa faixa={i.faixa} />
                  <span className="num text-sm text-fg-2">
                    {i.realizadas}/{i.meta} monitorias{i.faltam > 0 && <span className="text-regular"> · faltam {i.faltam}</span>}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-borda" aria-hidden>
                  <div className={cx('h-full rounded-full', pct >= 100 ? 'bg-excelente' : 'bg-regular')} style={{ width: `${pct}%` }} />
                </div>
                {registrar && i.faltam > 0 && (
                  <Link to={`/${slug}/nova?alvo=${i.id}`} className="self-start">
                    <Botao variante="fantasma" icone={<PlusCircle className="size-4" aria-hidden />}>
                      Registrar monitoria
                    </Botao>
                  </Link>
                )}
              </Cartao>
            );
          })}
        </div>
      )}
    </>
  );
}
