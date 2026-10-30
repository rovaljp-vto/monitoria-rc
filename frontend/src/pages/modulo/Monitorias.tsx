import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, MessageSquareText } from 'lucide-react';
import { api } from '@/lib/api';
import { CANAIS, FAIXAS, MODULOS, ORDEM_FAIXAS } from '@/lib/modulos';
import { fmtDataHora } from '@/lib/formato';
import type { Faixa, ListaMonitorias, Loja, Slug } from '@/lib/tipos';
import { Botao, CarregandoTela, Cartao, ErroTela, Nota, SeloFaixa, Vazio } from '@/components/ui';
import { Cabecalho } from '@/components/Layout';
import { SeletorMes, useMesDaUrl } from '@/components/SeletorMes';

/** Histórico de monitorias do módulo, com filtros por mês, loja e faixa. */
export default function Monitorias() {
  const slug = useParams().modulo as Slug;
  const m = MODULOS[slug];
  const [busca, setBusca] = useSearchParams();
  const [mes, setMes] = useMesDaUrl(busca, setBusca);
  const lojaId = busca.get('loja') ?? '';
  const faixa = (busca.get('faixa') ?? '') as Faixa | '';
  const pagina = Math.max(1, Number(busca.get('pagina')) || 1);

  function filtrar(chave: string, valor: string) {
    const nova = new URLSearchParams(busca);
    if (valor) nova.set(chave, valor);
    else nova.delete(chave);
    if (chave !== 'pagina') nova.delete('pagina');
    setBusca(nova);
  }

  const lojas = useQuery({ queryKey: ['lojas'], queryFn: () => api.get<Loja[]>('/api/lojas') });
  const q = useQuery({
    queryKey: ['monitorias', slug, mes, lojaId, faixa, pagina],
    queryFn: () => api.get<ListaMonitorias>(`/api/modulos/${slug}/monitorias`, { mes, lojaId, faixa, pagina }),
    placeholderData: keepPreviousData,
  });
  const paginas = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.porPagina)) : 1;

  return (
    <>
      <Cabecalho
        sobre={m.titulo}
        titulo="Monitorias"
        descricao="Toda monitoria registrada, com nota congelada no momento do registro."
        acoes={<SeletorMes mes={mes} onChange={setMes} />}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <label>
          <span className="sr-only">Loja</span>
          <select className="campo w-48 py-2" value={lojaId} onChange={(e) => filtrar('loja', e.target.value)}>
            <option value="">Todas as lojas</option>
            {lojas.data?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Faixa</span>
          <select className="campo w-44 py-2" value={faixa} onChange={(e) => filtrar('faixa', e.target.value)}>
            <option value="">Todas as faixas</option>
            {ORDEM_FAIXAS.map((f) => (
              <option key={f} value={f}>
                {FAIXAS[f].rotulo}
              </option>
            ))}
          </select>
        </label>
      </div>

      {q.isPending ? (
        <CarregandoTela />
      ) : q.error ? (
        <ErroTela erro={q.error} onTentar={() => q.refetch()} />
      ) : q.data.itens.length === 0 ? (
        <Vazio titulo="Nenhuma monitoria encontrada">Mude o mês ou os filtros.</Vazio>
      ) : (
        <>
          <Cartao className="overflow-hidden">
            <div role="row" className="hidden gap-4 border-b border-borda px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-3 md:grid md:grid-cols-[minmax(10rem,1.6fr)_9.5rem_minmax(7rem,1fr)_6rem_minmax(8rem,1.2fr)_5rem_7rem_4.5rem]">
              <span>{slug === 'vendedores' ? 'Vendedor(a)' : 'Loja'}</span>
              <span>Data</span>
              <span>{slug === 'vendedores' ? 'Loja' : ''}</span>
              <span>{slug === 'vendedores' ? 'Canal' : ''}</span>
              <span>Avaliado por</span>
              <span>Obs.</span>
              <span>Faixa</span>
              <span className="text-right">Nota</span>
            </div>
            <ul className="divide-y divide-borda">
              {q.data.itens.map((i) => (
                <li key={i.id}>
                  <Link
                    to={`/monitoria/${i.id}`}
                    className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 px-4 py-3 transition hover:bg-card-hover md:grid-cols-[minmax(10rem,1.6fr)_9.5rem_minmax(7rem,1fr)_6rem_minmax(8rem,1.2fr)_5rem_7rem_4.5rem]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{i.vendedor?.nome ?? i.loja.nome}</span>
                      <span className="block truncate text-xs text-fg-3 md:hidden">
                        {fmtDataHora(i.dataReferencia)}
                        {i.vendedor && ` · ${i.loja.nome}`}
                      </span>
                    </span>
                    <span className="num hidden text-sm text-fg-2 md:block">{fmtDataHora(i.dataReferencia)}</span>
                    <span className="hidden truncate text-sm text-fg-2 md:block">{i.vendedor ? i.loja.nome : ''}</span>
                    <span className="hidden text-sm text-fg-2 md:block">{i.canal ? CANAIS[i.canal] : ''}</span>
                    <span className="hidden truncate text-sm text-fg-3 md:block">{i.avaliador.nome}</span>
                    <span className="hidden items-center gap-1 text-xs text-fg-3 md:flex">
                      {i._count.observacoes > 0 && (
                        <>
                          <MessageSquareText className="size-3.5" aria-hidden /> {i._count.observacoes}
                        </>
                      )}
                    </span>
                    <span className="hidden md:block">
                      <SeloFaixa faixa={i.faixa} tamanho="sm" />
                    </span>
                    <Nota nota={i.nota} faixa={i.faixa} className="text-right text-lg" />
                  </Link>
                </li>
              ))}
            </ul>
          </Cartao>
          <div className="mt-4 flex items-center justify-between text-sm text-fg-2">
            <span className="num">{q.data.total} monitoria(s)</span>
            {paginas > 1 && (
              <div className="flex items-center gap-2">
                <Botao variante="fantasma" disabled={pagina <= 1} onClick={() => filtrar('pagina', String(pagina - 1))} aria-label="Página anterior">
                  <ChevronLeft className="size-4" aria-hidden />
                </Botao>
                <span className="num">
                  {pagina} / {paginas}
                </span>
                <Botao variante="fantasma" disabled={pagina >= paginas} onClick={() => filtrar('pagina', String(pagina + 1))} aria-label="Próxima página">
                  <ChevronRight className="size-4" aria-hidden />
                </Botao>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
