import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRightLeft, History, Lock, Search, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtData, fmtDataPura } from '@/lib/formato';
import type { Loja, Vendedor } from '@/lib/tipos';
import { Aviso, Botao, Campo, CarregandoTela, Cartao, cx, EASE, ErroTela, mensagemDeErro, Vazio } from '@/components/ui';

interface Lotacao {
  id: string;
  loja: { id: string; nome: string };
  dataInicio: string;
  dataFim: string | null;
  motivo: string | null;
  removivel: boolean;
}

const COLS = 'md:grid-cols-[minmax(12rem,2fr)_minmax(10rem,1.2fr)_minmax(10rem,1.2fr)_auto]';

const hojeLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

/**
 * Vendedores — escopo §4.6. Inativar tira da cobertura sem perder histórico.
 * Trocar de loja é TRANSFERÊNCIA com data, como no FAC: os meses anteriores
 * continuam mostrando o vendedor na loja em que ele estava.
 */
export function AdminVendedores() {
  const cliente = useQueryClient();
  const vendedores = useQuery({ queryKey: ['vendedores', 'todos'], queryFn: () => api.get<Vendedor[]>('/api/vendedores', { todos: 1 }) });
  const lojas = useQuery({ queryKey: ['lojas'], queryFn: () => api.get<Loja[]>('/api/lojas') });
  const [filtro, setFiltro] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);

  const invalidar = () => {
    cliente.invalidateQueries({ queryKey: ['vendedores'] });
    cliente.invalidateQueries({ queryKey: ['cobertura'] });
    cliente.invalidateQueries({ queryKey: ['lojas'] });
    cliente.invalidateQueries({ queryKey: ['lotacoes'] });
    cliente.invalidateQueries({ queryKey: ['dashboard'] });
    cliente.invalidateQueries({ queryKey: ['monitorias'] });
  };
  const editar = useMutation({
    mutationFn: (v: { id: string; dados: Record<string, unknown> }) => api.patch(`/api/vendedores/${v.id}`, v.dados),
    onSuccess: invalidar,
  });

  const lista = useMemo(() => {
    const t = filtro.trim().toLocaleLowerCase('pt-BR');
    return (vendedores.data ?? []).filter((v) => !t || v.nome.toLocaleLowerCase('pt-BR').includes(t) || v.loja.nome.toLocaleLowerCase('pt-BR').includes(t));
  }, [vendedores.data, filtro]);

  if (vendedores.isPending || lojas.isPending) return <CarregandoTela />;
  if (vendedores.error) return <ErroTela erro={vendedores.error} onTentar={() => vendedores.refetch()} />;
  if (lojas.error) return <ErroTela erro={lojas.error} onTentar={() => lojas.refetch()} />;

  const ativos = vendedores.data.filter((v) => v.ativo).length;
  const erro = editar.error;

  return (
    <div className="flex flex-col gap-4">
      {/* out/2026 — não há formulário de inclusão: o cadastro de vendedor é do
          RovalConnecta. Quem tem cargo "Vendedor" lá aparece nesta lista
          sozinho, com a loja e o histórico de lotação (o backend também não
          expõe mais POST /api/vendedores). */}
      <Cartao className="flex items-start gap-2.5 p-4">
        <Lock className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden />
        <p className="text-sm text-fg-2">
          Os vendedores vêm do <strong>RovalConnecta</strong>: quem tem cargo "Vendedor" lá
          aparece aqui automaticamente, com a loja e o histórico de lotação. Para incluir
          alguém, cadastre em <strong>Administração → Usuários</strong> no hub; para
          transferir de loja, use <strong>Transferir de filial</strong> por lá.
        </p>
      </Cartao>
      {erro && <Aviso>{mensagemDeErro(erro)}</Aviso>}

      <div className="flex items-center justify-between gap-3">
        <p className="num text-sm text-fg-2">
          {ativos} ativo(s) de {vendedores.data.length}
        </p>
        <label className="relative">
          <span className="sr-only">Filtrar</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
          <input className="campo w-56 py-2 pl-9" placeholder="Nome ou loja" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        </label>
      </div>

      {lista.length === 0 ? (
        <Vazio titulo={vendedores.data.length ? 'Nada com esse filtro' : 'Nenhum vendedor cadastrado'}>
          {vendedores.data.length
            ? undefined
            : 'Cadastre as pessoas com cargo "Vendedor" no RovalConnecta — elas aparecem aqui e entram na cobertura do mês.'}
        </Vazio>
      ) : (
        <Cartao className="overflow-hidden">
          <div className={cx('hidden gap-4 border-b border-borda px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-3 md:grid', COLS)}>
            <span>Nome</span>
            <span>Situação</span>
            <span>Loja atual</span>
            <span />
          </div>
          <ul className="divide-y divide-borda">
            {lista.map((v) => (
              <li key={v.id} className={cx(!v.ativo && 'opacity-60')}>
                <div className={cx('grid items-center gap-3 px-4 py-2.5', COLS)}>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{v.nome}</span>
                    {v.rovalManaged && (
                      <span
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-borda px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-fg-3"
                        title="Cadastro e lotação vêm do RovalConnecta. Nome, situação e transferência se alteram lá."
                      >
                        <Lock className="size-3" aria-hidden />
                        Roval
                      </span>
                    )}
                  </span>
                  <span className="text-sm text-fg-2">
                    {v.ativo ? (v.admissao ? `Ativo(a) · admissão ${fmtDataPura(v.admissao)}` : 'Ativo(a)') : `Inativo(a)${v.inativadoEm ? ` desde ${fmtData(v.inativadoEm)}` : ''}`}
                  </span>
                  <span className="truncate text-sm">{v.loja.nome}</span>
                  <span className="flex items-center justify-end gap-1.5">
                    <Botao
                      variante={aberto === v.id ? 'primario' : 'fantasma'}
                      className="min-h-9"
                      icone={v.rovalManaged ? <History className="size-4" aria-hidden /> : <ArrowRightLeft className="size-4" aria-hidden />}
                      aria-expanded={aberto === v.id}
                      onClick={() => setAberto((a) => (a === v.id ? null : v.id))}
                    >
                      {v.rovalManaged ? 'Histórico' : 'Transferir'}
                    </Botao>
                    {/* Replicado: a situação vem do RovalConnecta e o backend
                        recusa a troca aqui — o botão sai de cena. */}
                    {!v.rovalManaged && (
                      <Botao variante="fantasma" className="min-h-9" disabled={editar.isPending} onClick={() => editar.mutate({ id: v.id, dados: { ativo: !v.ativo } })}>
                        {v.ativo ? 'Inativar' : 'Reativar'}
                      </Botao>
                    )}
                  </span>
                </div>
                <AnimatePresence initial={false}>
                  {aberto === v.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: EASE }}
                      className="overflow-hidden"
                    >
                      <PainelLotacao vendedor={v} lojas={lojas.data} onMudou={invalidar} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </div>
  );
}

/** Transferir com data + histórico de lotação (loja por período). */
function PainelLotacao({ vendedor, lojas, onMudou }: { vendedor: Vendedor; lojas: Loja[]; onMudou: () => void }) {
  const historico = useQuery({
    queryKey: ['lotacoes', vendedor.id],
    queryFn: () => api.get<Lotacao[]>(`/api/vendedores/${vendedor.id}/lotacoes`),
  });
  const [dados, setDados] = useState({ lojaId: '', data: hojeLocal(), motivo: '' });
  const [aviso, setAviso] = useState<string | null>(null);

  const transferir = useMutation({
    mutationFn: () =>
      api.post<{ monitoriasRealinhadas: number }>(`/api/vendedores/${vendedor.id}/transferencias`, {
        lojaId: dados.lojaId,
        data: dados.data,
        ...(dados.motivo.trim() ? { motivo: dados.motivo.trim() } : {}),
      }),
    onSuccess: (r) => {
      const destino = lojas.find((l) => l.id === dados.lojaId)?.nome;
      setAviso(
        `Transferido(a) para ${destino} a partir de ${fmtDataPura(dados.data)}.` +
          (r.monitoriasRealinhadas ? ` ${r.monitoriasRealinhadas} monitoria(s) a partir dessa data passaram a contar em ${destino}.` : ''),
      );
      setDados({ lojaId: '', data: hojeLocal(), motivo: '' });
      onMudou();
    },
  });
  const remover = useMutation({
    mutationFn: (id: string) => api.delete<{ monitoriasRealinhadas: number }>(`/api/lotacoes/${id}`),
    onSuccess: () => {
      setAviso('Transferência desfeita.');
      onMudou();
    },
  });

  const destinos = lojas.filter((l) => l.id !== vendedor.loja.id);

  // Lotação gerenciada pelo RovalConnecta: o hub envia a timeline inteira a
  // cada replicação, então transferir aqui seria desfeito sem aviso (o backend
  // também recusa). Fica só o histórico, com o caminho de onde mexer.
  if (vendedor.rovalManaged) {
    return (
      <div className="border-t border-borda bg-card-hover/40 px-4 py-4">
        <Aviso tipo="info">
          A lotação de {vendedor.nome.split(' ')[0]} é definida no RovalConnecta, em
          Administração → Usuários → Transferir de filial. O histórico abaixo chega de lá
          automaticamente e as monitorias já lançadas continuam contando na loja em que
          {' '}{vendedor.nome.split(' ')[0]} estava em cada mês.
        </Aviso>
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <History className="size-4 text-fg-3" aria-hidden /> Histórico de lotação
          </p>
          {historico.isPending ? (
            <p className="text-sm text-fg-3">Carregando…</p>
          ) : historico.error ? (
            <Aviso>{mensagemDeErro(historico.error)}</Aviso>
          ) : (
            <ol className="relative flex flex-col gap-2 border-l-2 border-borda pl-4">
              {historico.data.map((p) => (
                <li key={p.id} className="relative">
                  <span className={cx('absolute -left-[21px] top-2.5 size-2.5 rounded-full', p.dataFim === null ? 'bg-marca' : 'bg-borda-forte')} aria-hidden />
                  <div className="rounded-xl bg-card px-3 py-2">
                    <p className="text-sm font-medium">
                      {p.loja.nome}
                      {p.dataFim === null && <span className="ml-2 rounded-full bg-marca-suave px-2 py-0.5 text-[11px] font-semibold text-marca-texto">atual</span>}
                    </p>
                    <p className="num text-xs text-fg-3">
                      {fmtDataPura(p.dataInicio)} — {p.dataFim ? fmtDataPura(p.dataFim) : 'hoje'}
                      {p.motivo && ` · ${p.motivo}`}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5 border-t border-borda bg-card-hover/40 px-4 py-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setAviso(null);
          if (dados.lojaId && dados.data) transferir.mutate();
        }}
      >
        <p className="text-sm font-semibold">Transferir {vendedor.nome.split(' ')[0]} de {vendedor.loja.nome} para…</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Nova loja" htmlFor={`t-loja-${vendedor.id}`}>
            <select id={`t-loja-${vendedor.id}`} className="campo" value={dados.lojaId} onChange={(e) => setDados({ ...dados, lojaId: e.target.value })} disabled={!vendedor.ativo}>
              <option value="">Selecione…</option>
              {destinos.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="A partir de" htmlFor={`t-data-${vendedor.id}`} dica="Os meses antes desta data não mudam.">
            <input id={`t-data-${vendedor.id}`} type="date" className="campo" value={dados.data} onChange={(e) => setDados({ ...dados, data: e.target.value })} disabled={!vendedor.ativo} />
          </Campo>
        </div>
        <Campo rotulo="Motivo (opcional)" htmlFor={`t-mot-${vendedor.id}`}>
          <input id={`t-mot-${vendedor.id}`} className="campo" maxLength={300} value={dados.motivo} onChange={(e) => setDados({ ...dados, motivo: e.target.value })} disabled={!vendedor.ativo} />
        </Campo>
        {!vendedor.ativo && <Aviso tipo="info">Reative o(a) vendedor(a) para transferir.</Aviso>}
        {(transferir.error || remover.error) && <Aviso>{mensagemDeErro(transferir.error ?? remover.error)}</Aviso>}
        {aviso && <Aviso tipo="info">{aviso}</Aviso>}
        <Botao type="submit" className="self-start" carregando={transferir.isPending} disabled={!vendedor.ativo || !dados.lojaId || !dados.data} icone={<ArrowRightLeft className="size-4" aria-hidden />}>
          Confirmar transferência
        </Botao>
      </form>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <History className="size-4 text-fg-3" aria-hidden /> Histórico de lotação
        </p>
        {historico.isPending ? (
          <p className="text-sm text-fg-3">Carregando…</p>
        ) : historico.error ? (
          <Aviso>{mensagemDeErro(historico.error)}</Aviso>
        ) : (
          <ol className="relative flex flex-col gap-2 border-l-2 border-borda pl-4">
            {historico.data.map((p) => (
              <li key={p.id} className="relative">
                <span className={cx('absolute -left-[21px] top-2.5 size-2.5 rounded-full', p.dataFim === null ? 'bg-marca' : 'bg-borda-forte')} aria-hidden />
                <div className="flex items-start justify-between gap-2 rounded-xl bg-card px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {p.loja.nome}
                      {p.dataFim === null && <span className="ml-2 rounded-full bg-marca-suave px-2 py-0.5 text-[11px] font-semibold text-marca-texto">atual</span>}
                    </p>
                    <p className="num text-xs text-fg-3">
                      {fmtDataPura(p.dataInicio)} — {p.dataFim ? fmtDataPura(p.dataFim) : 'hoje'}
                      {p.motivo && ` · ${p.motivo}`}
                    </p>
                  </div>
                  {p.removivel && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Desfazer a transferência para ${p.loja.nome} (${fmtDataPura(p.dataInicio)})? As monitorias desse período voltam para a loja anterior.`)) {
                          setAviso(null);
                          remover.mutate(p.id);
                        }
                      }}
                      className="grid size-8 shrink-0 place-items-center rounded-lg text-fg-3 transition hover:bg-critico-bg hover:text-critico"
                      aria-label={`Desfazer transferência para ${p.loja.nome}`}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
