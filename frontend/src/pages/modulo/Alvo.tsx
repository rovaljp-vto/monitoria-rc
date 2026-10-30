import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PlusCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { CANAIS, FAIXAS, MODULOS } from '@/lib/modulos';
import { pode, useEu } from '@/lib/sessao';
import { fmtDataHora, fmtMes, fmtNota } from '@/lib/formato';
import type { HistoricoAlvo, Slug } from '@/lib/tipos';
import { Botao, CarregandoTela, Cartao, cx, ErroTela, Nota, Rotulo, SeloFaixa, Vazio } from '@/components/ui';
import { Cabecalho } from '@/components/Layout';

/**
 * Histórico de um vendedor ou de uma loja — escopo §4.3 (evolução individual):
 * a nota mês a mês e o % de "Sim" por critério, que mostra se o problema é
 * sempre o mesmo (ex.: nunca faz upselling).
 */
export default function Alvo() {
  const { modulo, id } = useParams();
  const slug = modulo as Slug;
  const m = MODULOS[slug];
  const { data: eu } = useEu();
  const q = useQuery({
    queryKey: ['alvo', slug, id],
    queryFn: () => api.get<HistoricoAlvo>(`/api/modulos/${slug}/alvos/${id}`),
  });

  if (q.isPending) return <CarregandoTela />;
  if (q.error) return <ErroTela erro={q.error} onTentar={() => q.refetch()} />;

  const { alvo, porMes, porCriterio, monitorias } = q.data;
  const inativo = alvo.ativo === false || alvo.ativa === false;
  const maxMeses = porMes.slice(-12);

  return (
    <>
      <Cabecalho
        voltar={`/${slug}`}
        sobre={m.titulo}
        titulo={alvo.nome}
        descricao={
          <>
            {alvo.loja ? `${alvo.loja.nome} · ` : ''}
            {monitorias.length} monitoria(s) no histórico{inativo ? ' · inativo(a)' : ''}
          </>
        }
        acoes={
          pode(eu, m.perm.registrar) && !inativo ? (
            <Link to={`/${slug}/nova?alvo=${alvo.id}`}>
              <Botao icone={<PlusCircle className="size-4" aria-hidden />}>Nova monitoria</Botao>
            </Link>
          ) : undefined
        }
      />

      {monitorias.length === 0 ? (
        <Vazio titulo="Sem monitorias ainda">Quando houver registros, a evolução aparece aqui.</Vazio>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Cartao className="p-5">
            <h2 className="mb-4">
              <Rotulo>Nota média por mês</Rotulo>
            </h2>
            {/* Barras simples: poucas colunas, leitura direta, sem biblioteca de gráfico. */}
            <div className="flex h-44 items-end gap-2" role="list" aria-label="Nota média por mês">
              {maxMeses.map((p) => (
                <div key={p.mes} role="listitem" className="flex h-full flex-1 flex-col items-center justify-end gap-1.5" aria-label={`${fmtMes(p.mes)}: ${fmtNota(p.media)}, ${FAIXAS[p.faixa].rotulo}`}>
                  <span className={cx('num text-xs font-semibold', FAIXAS[p.faixa].cor)}>{fmtNota(p.media)}</span>
                  <div className={cx('w-full max-w-10 rounded-t-md', FAIXAS[p.faixa].barra)} style={{ height: `${Math.max(4, p.media)}%` }} />
                  <span className="text-[11px] text-fg-3">{fmtMes(p.mes, true)}</span>
                </div>
              ))}
            </div>
          </Cartao>

          <Cartao className="p-5">
            <h2 className="mb-4">
              <Rotulo>% de "Sim" por critério</Rotulo>
            </h2>
            <ul className="flex flex-col gap-3">
              {porCriterio.map((c) => (
                <li key={c.criterio}>
                  <div className="mb-1 flex justify-between gap-3 text-sm">
                    <span className="truncate">{c.criterio}</span>
                    <span className="num shrink-0 text-fg-2">{c.percentualSim === null ? 'N/A' : `${fmtNota(c.percentualSim)}%`}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-borda" aria-hidden>
                    <div
                      className={cx('h-full rounded-full', (c.percentualSim ?? 0) >= 75 ? 'bg-excelente' : (c.percentualSim ?? 0) >= 50 ? 'bg-regular' : 'bg-critico')}
                      style={{ width: `${c.percentualSim ?? 0}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Cartao>

          <section className="lg:col-span-2" aria-labelledby="hist">
            <h2 id="hist" className="mb-3">
              <Rotulo>Monitorias</Rotulo>
            </h2>
            <Cartao className="overflow-hidden">
              <ul className="divide-y divide-borda">
                {monitorias.map((mo) => (
                  <li key={mo.id}>
                    <Link to={`/monitoria/${mo.id}`} className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-card-hover">
                      <span className="min-w-0">
                        <span className="block font-medium">{fmtDataHora(mo.dataReferencia)}</span>
                        <span className="block truncate text-xs text-fg-3">
                          {mo.canal ? `${CANAIS[mo.canal]} · ` : ''}
                          {slug === 'vendedores' ? `${mo.loja} · ` : ''}por {mo.avaliador}
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <SeloFaixa faixa={mo.faixa} tamanho="sm" />
                        <Nota nota={mo.nota} faixa={mo.faixa} className="w-12 text-right text-lg" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Cartao>
          </section>
        </div>
      )}
    </>
  );
}
