import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIXAS } from '@/lib/modulos';
import type { Parametros } from '@/lib/tipos';
import { Aviso, Botao, CarregandoTela, Cartao, cx, ErroTela, mensagemDeErro, Rotulo } from '@/components/ui';

type Chave = keyof Parametros;

/** Escopo §3.4, §4.2 e §4.3 — faixas de nota, metas por faixa e alerta de fim de mês. */
export function AdminParametros() {
  const cliente = useQueryClient();
  const q = useQuery({ queryKey: ['parametros'], queryFn: () => api.get<Parametros>('/api/parametros') });
  const [p, setP] = useState<Parametros | null>(null);
  useEffect(() => {
    if (q.data) setP(q.data);
  }, [q.data]);

  const salvar = useMutation({
    mutationFn: (dados: Parametros) => api.put<Parametros>('/api/parametros', dados),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['parametros'] });
      cliente.invalidateQueries({ queryKey: ['cobertura'] });
      cliente.invalidateQueries({ queryKey: ['foco'] });
    },
  });

  if (q.isPending || !p) return <CarregandoTela linhas={3} />;
  if (q.error) return <ErroTela erro={q.error} onTentar={() => q.refetch()} />;

  const numero = (chave: Chave, rotulo: string, min: number, max: number, dica?: string) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{rotulo}</span>
      <input
        type="number"
        min={min}
        max={max}
        className="campo num"
        value={p[chave]}
        onChange={(e) => setP({ ...p, [chave]: Math.trunc(Number(e.target.value)) })}
      />
      {dica && <span className="text-xs text-fg-3">{dica}</span>}
    </label>
  );

  const ordemOk = p.excelenteMin > p.bomMin && p.bomMin > p.regularMin;
  const metasOk = p.metaRegular >= p.metaBase && p.metaCritico >= p.metaRegular;
  const campos = Object.keys(p).filter((k) => k in (q.data as object)) as Chave[];
  const alterado = campos.some((k) => p[k] !== q.data[k]);

  return (
    <form
      className="grid items-start gap-5 xl:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        const { excelenteMin, bomMin, regularMin, metaBase, metaRegular, metaCritico, diaAlertaFimMes } = p;
        salvar.mutate({ excelenteMin, bomMin, regularMin, metaBase, metaRegular, metaCritico, diaAlertaFimMes });
      }}
    >
      <Cartao className="p-5 xl:col-span-3">
        <Rotulo>Faixas de nota</Rotulo>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {numero('excelenteMin', 'Excelente a partir de', 1, 100)}
          {numero('bomMin', 'Bom a partir de', 1, 100)}
          {numero('regularMin', 'Regular a partir de', 1, 100, 'Abaixo disso, Crítico.')}
        </div>
        {/* Régua de 0 a 100 mostrando onde cada faixa começa. */}
        <div className="mt-5 flex h-3 overflow-hidden rounded-full" aria-hidden>
          <div className={FAIXAS.CRITICO.barra} style={{ width: `${p.regularMin}%` }} />
          <div className={FAIXAS.REGULAR.barra} style={{ width: `${Math.max(0, p.bomMin - p.regularMin)}%` }} />
          <div className={FAIXAS.BOM.barra} style={{ width: `${Math.max(0, p.excelenteMin - p.bomMin)}%` }} />
          <div className={cx('flex-1', FAIXAS.EXCELENTE.barra)} />
        </div>
        <p className="mt-2 text-xs text-fg-3">
          Crítico 0–{p.regularMin - 1} · Regular {p.regularMin}–{p.bomMin - 1} · Bom {p.bomMin}–{p.excelenteMin - 1} · Excelente {p.excelenteMin}–100
        </p>
        {!ordemOk && <p className="mt-2 text-xs text-critico">As faixas precisam ficar em ordem: Excelente &gt; Bom &gt; Regular.</p>}
      </Cartao>

      <Cartao className="p-5 xl:col-span-2">
        <Rotulo>Metas de monitoria por mês</Rotulo>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {numero('metaBase', 'Todos', 1, 20, 'Mínimo por vendedor ou loja.')}
          {numero('metaRegular', 'Em foco — Regular', 1, 20)}
          {numero('metaCritico', 'Em foco — Crítico', 1, 20)}
        </div>
        {!metasOk && <p className="mt-2 text-xs text-critico">As metas de foco não podem ser menores que a meta de todos, e Crítico precisa de pelo menos tanto quanto Regular.</p>}
      </Cartao>

      <Cartao className="p-5">
        <Rotulo>Alerta de fim de mês</Rotulo>
        <div className="mt-4">{numero('diaAlertaFimMes', 'Destacar pendências a partir do dia', 1, 28)}</div>
      </Cartao>

      <div className="flex flex-col gap-3 xl:col-span-3">
      {salvar.error && <Aviso>{mensagemDeErro(salvar.error)}</Aviso>}
      {salvar.isSuccess && !alterado && <Aviso tipo="info">Parâmetros salvos. As notas já registradas mantêm a faixa de quando foram feitas.</Aviso>}
      <Botao type="submit" className="self-end" disabled={!alterado || !ordemOk || !metasOk} carregando={salvar.isPending}>
        Salvar parâmetros
      </Botao>
      </div>
    </form>
  );
}
