import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { calcularNota, LIMITES_PADRAO } from '@motor';
import { api, ApiError } from '@/lib/api';
import { CANAIS, FAIXAS, MODULOS } from '@/lib/modulos';
import { agoraLocal, fmtNota, paraInputLocal } from '@/lib/formato';
import type { Canal, FormularioRetificacao, Loja, Parametros, Resposta, Slug, Vendedor, VersaoChecklist } from '@/lib/tipos';
import { reduzirImagem } from '@/lib/imagens';
import { Anel, Aviso, Botao, Campo, CarregandoTela, Cartao, cx, EASE, ErroTela, mensagemDeErro, Rotulo, SeloFaixa } from '@/components/ui';
import { Cabecalho } from '@/components/Layout';
import { AreaComImagens } from '@/components/Imagens';

const COR_FAIXA = { EXCELENTE: 'var(--excelente)', BOM: 'var(--bom)', REGULAR: 'var(--regular)', CRITICO: 'var(--critico)' } as const;

/** Escopo §4.1 (vendedores) e §4.5 (lojas) — registro com nota calculada na hora. */
export default function NovaMonitoria() {
  const slug = useParams().modulo as Slug;
  const m = MODULOS[slug];
  const ehVendedor = slug === 'vendedores';
  const [busca] = useSearchParams();
  const cliente = useQueryClient();

  // Edição (retificação): o formulário usa a versão do checklist DA monitoria
  // original e chega pré-preenchido; salvar exige um motivo, que fica gravado.
  const retificaId = busca.get('retifica');

  const checklist = useQuery({
    queryKey: ['checklist', slug],
    queryFn: () => api.get<VersaoChecklist>(`/api/checklists/${slug}`),
    staleTime: 0,
    enabled: !retificaId,
  });
  const original = useQuery({
    queryKey: ['retificacao', retificaId],
    queryFn: () => api.get<FormularioRetificacao>(`/api/monitorias/${retificaId}/retificacao`),
    staleTime: 0,
    enabled: !!retificaId,
  });
  const lojas = useQuery({ queryKey: ['lojas'], queryFn: () => api.get<Loja[]>('/api/lojas') });
  const parametros = useQuery({ queryKey: ['parametros'], queryFn: () => api.get<Parametros>('/api/parametros') });
  const vendedores = useQuery({
    queryKey: ['vendedores', 'ativos'],
    queryFn: () => api.get<Vendedor[]>('/api/vendedores'),
    enabled: ehVendedor,
  });

  const [lojaId, setLojaId] = useState('');
  const [vendedorId, setVendedorId] = useState('');
  const [canal, setCanal] = useState<Canal | ''>('');
  const [data, setData] = useState(agoraLocal);
  const [respostas, setRespostas] = useState<Record<string, Resposta>>({});
  const [observacao, setObservacao] = useState('');
  const [obsCriterio, setObsCriterio] = useState<Record<string, string>>({});
  const [imagens, setImagens] = useState<File[]>([]);
  const [motivo, setMotivo] = useState('');
  const [tentouSalvar, setTentouSalvar] = useState(false);

  // Edição: pré-preenche tudo com a monitoria original.
  useEffect(() => {
    const o = original.data;
    if (!o) return;
    setLojaId(o.lojaId);
    setVendedorId(o.vendedorId ?? '');
    setCanal(o.canal ?? '');
    setData(paraInputLocal(o.dataReferencia));
    setRespostas(Object.fromEntries(o.respostas.map((r) => [r.perguntaId, r.resposta])));
    setObsCriterio(Object.fromEntries(o.respostas.filter((r) => r.observacao).map((r) => [r.perguntaId, r.observacao as string])));
  }, [original.data]);

  // Chegou por um atalho (cobertura, foco, histórico): já vem com o alvo escolhido.
  const alvoInicial = busca.get('alvo');
  useEffect(() => {
    if (!alvoInicial || retificaId) return;
    if (ehVendedor && vendedores.data) {
      const v = vendedores.data.find((x) => x.id === alvoInicial);
      if (v) {
        setLojaId(v.loja.id);
        setVendedorId(v.id);
      }
    } else if (!ehVendedor && lojas.data?.some((l) => l.id === alvoInicial)) {
      setLojaId(alvoInicial);
    }
  }, [alvoInicial, retificaId, ehVendedor, vendedores.data, lojas.data]);

  const vendedoresDaLoja = useMemo(
    () => (vendedores.data ?? []).filter((v) => !lojaId || v.loja.id === lojaId),
    [vendedores.data, lojaId],
  );

  // Na edição, a versão do checklist é a DA monitoria original.
  const versaoForm = retificaId ? original.data?.versao : checklist.data;
  const perguntas = versaoForm?.perguntas ?? [];
  const resultado = useMemo(
    () => calcularNota(perguntas, respostas, parametros.data ?? LIMITES_PADRAO),
    [perguntas, respostas, parametros.data],
  );
  const respondidas = perguntas.filter((p) => respostas[p.id]).length;

  const faltaMotivo = !!retificaId && motivo.trim().length < 5;
  const faltaCabecalho =
    !lojaId || (ehVendedor && (!vendedorId || !canal)) || !data || new Date(data).getTime() > Date.now() + 60_000 || faltaMotivo;

  const salvar = useMutation({
    mutationFn: async () => {
      const destino = retificaId ? `/api/monitorias/${retificaId}/retificar` : `/api/modulos/${slug}/monitorias`;
      const m = await api.post<{ id: string; nota: number; faixa: keyof typeof FAIXAS; observacaoId: string | null }>(destino, {
        lojaId,
        ...(ehVendedor ? { vendedorId, canal } : {}),
        dataReferencia: new Date(data).toISOString(),
        versaoId: versaoForm?.id,
        respostas: Object.entries(respostas).map(([perguntaId, resposta]) => ({
          perguntaId,
          resposta,
          ...(obsCriterio[perguntaId]?.trim() ? { observacao: obsCriterio[perguntaId].trim() } : {}),
        })),
        ...(observacao.trim() ? { observacao: observacao.trim() } : {}),
        ...(imagens.length ? { observacaoComImagens: true } : {}),
        ...(retificaId ? { motivo: motivo.trim() } : {}),
      });
      // A monitoria JÁ está gravada. Falha nas imagens vira aviso, nunca erro:
      // um erro aqui convidaria a salvar de novo e duplicar a monitoria.
      let erroImagens: string | null = null;
      if (imagens.length && m.observacaoId) {
        try {
          const reduzidas = await Promise.all(imagens.map(reduzirImagem));
          await api.arquivos(`/api/observacoes/${m.observacaoId}/imagens`, 'imagens', reduzidas);
        } catch (e) {
          erroImagens = mensagemDeErro(e);
        }
      }
      return { ...m, erroImagens };
    },
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['cobertura', slug] });
      cliente.invalidateQueries({ queryKey: ['foco', slug] });
      cliente.invalidateQueries({ queryKey: ['monitorias', slug] });
      cliente.invalidateQueries({ queryKey: ['alvo', slug] });
      // A original ganhou o aviso "retificada" — recarrega o detalhe dela.
      if (retificaId) cliente.invalidateQueries({ queryKey: ['monitoria', retificaId] });
    },
  });

  function reiniciar() {
    salvar.reset();
    setVendedorId('');
    setCanal('');
    setData(agoraLocal());
    setRespostas({});
    setObservacao('');
    setObsCriterio({});
    setImagens([]);
    setTentouSalvar(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setTentouSalvar(true);
    if (faltaCabecalho || !resultado.ok) return;
    salvar.mutate();
  }

  const fonteVersao = retificaId ? original : checklist;
  if (fonteVersao.isPending || lojas.isPending) return <CarregandoTela />;
  if (fonteVersao.error) return <ErroTela erro={fonteVersao.error} onTentar={() => fonteVersao.refetch()} />;
  if (lojas.error) return <ErroTela erro={lojas.error} onTentar={() => lojas.refetch()} />;

  if (salvar.isSuccess) {
    const f = FAIXAS[salvar.data.faixa];
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="mx-auto max-w-lg py-10">
        <Cartao className="flex flex-col items-center gap-5 p-10 text-center">
          <CheckCircle2 className="size-10 text-excelente" aria-hidden />
          <div>
            <h1 className="font-display text-3xl font-semibold">{retificaId ? 'Monitoria retificada' : 'Monitoria registrada'}</h1>
            <p className="mt-2 text-sm text-fg-2">
              {retificaId
                ? 'A versão corrigida entrou no lugar da original, que fica guardada como histórico junto com o motivo.'
                : `A nota foi calculada e congelada com a versão ${versaoForm?.numero} do checklist.`}
            </p>
          </div>
          {salvar.data.erroImagens && (
            <div className="w-full text-left">
              <Aviso tipo="alerta" titulo="As imagens não foram anexadas">
                {salvar.data.erroImagens} A monitoria está salva — abra ela e adicione as imagens numa nova observação.
              </Aviso>
            </div>
          )}
          <Anel valor={salvar.data.nota} tamanho={132} cor={COR_FAIXA[salvar.data.faixa]} rotulo={`Nota ${fmtNota(salvar.data.nota)}`}>
            <span className="num font-display text-3xl font-semibold">{fmtNota(salvar.data.nota)}</span>
          </Anel>
          <p className="text-sm">
            <SeloFaixa faixa={salvar.data.faixa} /> <span className="ml-2 text-fg-2">{f.acao}</span>
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {!retificaId && <Botao onClick={reiniciar}>Registrar outra</Botao>}
            {ehVendedor && (
              <Link to={`/monitoria/${salvar.data.id}/feedback`}>
                <Botao variante="fantasma">Apresentar feedback agora</Botao>
              </Link>
            )}
            <Link to={`/monitoria/${salvar.data.id}`}>
              <Botao variante="fantasma">Ver monitoria</Botao>
            </Link>
            <Link to={`/${slug}`}>
              <Botao variante="sutil">Voltar à cobertura</Botao>
            </Link>
          </div>
        </Cartao>
      </motion.div>
    );
  }

  const conflito = salvar.error instanceof ApiError && salvar.error.status === 409;

  return (
    <>
      <Cabecalho
        sobre={m.titulo}
        titulo={retificaId ? 'Editar monitoria' : 'Nova monitoria'}
        voltar={retificaId ? `/monitoria/${retificaId}` : undefined}
        descricao={
          retificaId
            ? `Retificação com a versão ${versaoForm?.numero} do checklist — a mesma da monitoria original. A original fica guardada como histórico.`
            : `${versaoForm?.checklist?.nome ?? 'Checklist'} · versão ${versaoForm?.numero}. A nota é calculada enquanto você responde.`
        }
      />

      <form onSubmit={enviar} noValidate className="grid items-start gap-6 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-6">
          {retificaId && (
            <Cartao className="flex flex-col gap-3 p-5">
              <Campo
                rotulo="Motivo da edição"
                htmlFor="motivo"
                dica="Obrigatório. Fica registrado de forma permanente, junto da monitoria original."
                erro={tentouSalvar && faltaMotivo ? 'Explique o motivo da edição (mínimo 5 caracteres).' : undefined}
              >
                <textarea
                  id="motivo"
                  rows={2}
                  maxLength={1000}
                  className="campo resize-y"
                  placeholder="Ex.: respostas lançadas no critério errado; data do atendimento corrigida."
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </Campo>
            </Cartao>
          )}
          <Cartao className="grid gap-4 p-5 sm:grid-cols-2">
            <Campo rotulo="Loja" htmlFor="loja" erro={tentouSalvar && !lojaId ? 'Escolha a loja.' : undefined}>
              <select
                id="loja"
                className="campo"
                value={lojaId}
                onChange={(e) => {
                  setLojaId(e.target.value);
                  setVendedorId('');
                }}
              >
                <option value="">Selecione…</option>
                {lojas.data.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </select>
            </Campo>

            {ehVendedor && (
              <Campo rotulo="Vendedor(a)" htmlFor="vendedor" erro={tentouSalvar && !vendedorId ? 'Escolha quem foi avaliado(a).' : undefined}>
                <select id="vendedor" className="campo" value={vendedorId} onChange={(e) => setVendedorId(e.target.value)} disabled={!lojaId}>
                  <option value="">{lojaId ? 'Selecione…' : 'Escolha a loja primeiro'}</option>
                  {vendedoresDaLoja.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nome}
                    </option>
                  ))}
                </select>
              </Campo>
            )}

            {ehVendedor && (
              <Campo rotulo="Canal do atendimento" erro={tentouSalvar && !canal ? 'Informe o canal.' : undefined}>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Canal do atendimento">
                  {(Object.keys(CANAIS) as Canal[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={canal === c}
                      onClick={() => setCanal(c)}
                      className={cx(
                        'rounded-xl border px-3 py-2.5 text-sm font-medium transition',
                        canal === c ? 'border-marca bg-marca-suave text-fg' : 'border-borda bg-campo text-fg-2 hover:text-fg',
                      )}
                    >
                      {CANAIS[c]}
                    </button>
                  ))}
                </div>
              </Campo>
            )}

            <Campo
              rotulo={ehVendedor ? 'Data e hora do atendimento' : 'Data e hora da visita'}
              htmlFor="data"
              erro={tentouSalvar && new Date(data).getTime() > Date.now() + 60_000 ? 'Não pode estar no futuro.' : undefined}
            >
              <input id="data" type="datetime-local" className="campo" value={data} max={agoraLocal()} onChange={(e) => setData(e.target.value)} />
            </Campo>
          </Cartao>

          <section aria-labelledby="criterios">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 id="criterios">
                <Rotulo>Critérios</Rotulo>
              </h2>
              <span className="num text-xs text-fg-3">
                {respondidas}/{perguntas.length} respondidos
              </span>
            </div>
            <ol className="flex flex-col gap-3">
              {perguntas.map((p, i) => {
                const r = respostas[p.id];
                const pendente = tentouSalvar && !r;
                const opcoes: { v: Resposta; rotulo: string }[] = [
                  { v: 'SIM', rotulo: 'Sim' },
                  { v: 'NAO', rotulo: 'Não' },
                  ...(p.tipoResposta === 'SIM_NAO_NA' ? [{ v: 'NA' as Resposta, rotulo: 'Não se aplica' }] : []),
                ];
                return (
                  <li key={p.id}>
                    <Cartao as="div" className={cx('flex flex-col gap-3 p-4', pendente && 'ring-1 ring-critico/60')}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-medium">
                          <span className="num mr-2 text-fg-3">{i + 1}.</span>
                          {p.texto}
                        </p>
                        <p className="mt-0.5 text-xs text-fg-3">
                          {p.descricao ? `${p.descricao} · ` : ''}peso {p.peso}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1.5" role="radiogroup" aria-label={p.texto}>
                        {opcoes.map((o) => (
                          <button
                            key={o.v}
                            type="button"
                            role="radio"
                            aria-checked={r === o.v}
                            onClick={() => setRespostas((a) => ({ ...a, [p.id]: o.v }))}
                            className={cx(
                              'min-h-10 rounded-xl border px-3.5 text-sm font-medium transition active:scale-[0.97]',
                              r === o.v
                                ? o.v === 'SIM'
                                  ? 'border-excelente/50 bg-excelente-bg text-excelente'
                                  : o.v === 'NAO'
                                    ? 'border-critico/50 bg-critico-bg text-critico'
                                    : 'border-borda-forte bg-card-hover text-fg'
                                : 'border-borda bg-campo text-fg-2 hover:text-fg',
                            )}
                          >
                            {o.rotulo}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="flex flex-col gap-1">
                      <span className="sr-only">Observação sobre {p.texto} (opcional)</span>
                      <textarea
                        rows={2}
                        maxLength={1000}
                        className="campo resize-y text-sm"
                        placeholder="Observação (opcional)"
                        value={obsCriterio[p.id] ?? ''}
                        onChange={(e) => setObsCriterio((a) => ({ ...a, [p.id]: e.target.value }))}
                      />
                    </label>
                    </Cartao>
                  </li>
                );
              })}
            </ol>
          </section>

          <Campo rotulo="Observações" htmlFor="obs" dica="Pontos fortes, pontos a melhorar e contexto. Aceita imagens — prints de conversa, fotos. Não podem ser apagadas depois, só complementadas.">
            <AreaComImagens arquivos={imagens} onArquivos={setImagens}>
              <textarea
                id="obs"
                rows={4}
                maxLength={4000}
                className="campo resize-y"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
              />
            </AreaComImagens>
          </Campo>
        </div>

        {/* Nota ao vivo — mesmo motor que o servidor usa para gravar. */}
        <aside className="lg:sticky lg:top-36">
          <Cartao className="flex flex-col items-center gap-4 p-6 text-center">
            <Rotulo>Nota prévia</Rotulo>
            <Anel
              valor={resultado.ok ? resultado.nota : 0}
              tamanho={148}
              espessura={12}
              cor={resultado.ok ? COR_FAIXA[resultado.faixa] : 'var(--borda-forte)'}
              rotulo={resultado.ok ? `Nota prévia ${fmtNota(resultado.nota)}` : 'Nota ainda não calculada'}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={resultado.ok ? resultado.nota : 'sem'}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="num font-display text-4xl font-semibold"
                >
                  {resultado.ok ? fmtNota(resultado.nota) : '—'}
                </motion.span>
              </AnimatePresence>
            </Anel>
            <div className="min-h-12">
              {resultado.ok ? (
                <>
                  <SeloFaixa faixa={resultado.faixa} />
                  <p className="mt-2 text-xs text-fg-2">{FAIXAS[resultado.faixa].acao}</p>
                </>
              ) : (
                <p className="text-xs text-fg-3">
                  {respondidas < perguntas.length
                    ? `Faltam ${perguntas.length - respondidas} critério(s).`
                    : resultado.erro}
                </p>
              )}
            </div>

            {salvar.error && (
              <div className="w-full text-left">
                <Aviso titulo={conflito && !retificaId ? 'Checklist atualizado' : 'Não foi possível salvar'}>{mensagemDeErro(salvar.error)}</Aviso>
                {conflito && !retificaId && (
                  <Botao
                    type="button"
                    variante="fantasma"
                    className="mt-2 w-full"
                    icone={<RotateCcw className="size-4" aria-hidden />}
                    onClick={() => {
                      setRespostas({});
                      salvar.reset();
                      checklist.refetch();
                    }}
                  >
                    Recarregar checklist
                  </Botao>
                )}
              </div>
            )}
            {tentouSalvar && (faltaCabecalho || !resultado.ok) && !salvar.error && (
              <p className="text-xs text-critico" role="alert">
                Complete os campos destacados antes de salvar.
              </p>
            )}

            <Botao type="submit" className="w-full" carregando={salvar.isPending}>
              {retificaId ? 'Salvar retificação' : 'Salvar monitoria'}
            </Botao>
          </Cartao>
        </aside>
      </form>
    </>
  );
}
