import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Lock, MessageSquareText, Minus, Pencil, Presentation, X } from 'lucide-react';
import { api } from '@/lib/api';
import { CANAIS, FAIXAS, MODULOS, slugDoTipo } from '@/lib/modulos';
import { fmtDataHora, fmtNota } from '@/lib/formato';
import type { MonitoriaDetalhe, Observacao } from '@/lib/tipos';
import { Anel, Aviso, Botao, CarregandoTela, Cartao, cx, ErroTela, mensagemDeErro, Rotulo, SeloFaixa } from '@/components/ui';
import { Cabecalho, useModuloDaTela } from '@/components/Layout';
import { AreaComImagens, Galeria } from '@/components/Imagens';
import { reduzirImagem } from '@/lib/imagens';

const COR = { EXCELENTE: 'var(--excelente)', BOM: 'var(--bom)', REGULAR: 'var(--regular)', CRITICO: 'var(--critico)' } as const;

export default function DetalheMonitoria() {
  const { id } = useParams();
  const cliente = useQueryClient();
  const q = useQuery({
    queryKey: ['monitoria', id],
    queryFn: () => api.get<MonitoriaDetalhe>(`/api/monitorias/${id}`),
  });
  useModuloDaTela(q.data ? slugDoTipo(q.data.tipo) : null);
  const [texto, setTexto] = useState('');
  const [imagens, setImagens] = useState<File[]>([]);
  const observar = useMutation({
    mutationFn: async () => {
      const obs = await api.post<Observacao>(`/api/monitorias/${id}/observacoes`, {
        texto: texto.trim(),
        ...(imagens.length ? { comImagens: true } : {}),
      });
      if (imagens.length) {
        const reduzidas = await Promise.all(imagens.map(reduzirImagem));
        await api.arquivos(`/api/observacoes/${obs.id}/imagens`, 'imagens', reduzidas);
      }
    },
    // Recarrega mesmo em erro: a observação pode ter sido gravada antes da falha nas imagens.
    onSettled: () => cliente.invalidateQueries({ queryKey: ['monitoria', id] }),
    onSuccess: () => {
      setTexto('');
      setImagens([]);
    },
  });

  if (q.isPending) return <CarregandoTela />;
  if (q.error) return <ErroTela erro={q.error} onTentar={() => q.refetch()} />;
  const d = q.data;
  const slug = slugDoTipo(d.tipo);
  const alvoId = d.vendedor?.id ?? d.loja.id;

  return (
    <>
      <Cabecalho
        voltar={`/${slug}/monitorias`}
        sobre={MODULOS[slug].titulo}
        titulo={d.vendedor?.nome ?? d.loja.nome}
        descricao={
          <>
            {fmtDataHora(d.dataReferencia)}
            {d.vendedor && ` · ${d.loja.nome}`}
            {d.canal && ` · ${CANAIS[d.canal]}`} · avaliado por {d.avaliador}
          </>
        }
        acoes={
          <>
            <Link to={`/${slug}/alvo/${alvoId}`}>
              <Botao variante="fantasma">Ver histórico</Botao>
            </Link>
            {d.podeRetificar && (
              <Link to={`/${slug}/nova?retifica=${d.id}`}>
                <Botao variante="fantasma" icone={<Pencil className="size-4" aria-hidden />}>Editar</Botao>
              </Link>
            )}
            {/* Feedback é conversa com o(a) vendedor(a) — loja não tem. */}
            {d.tipo === 'VENDEDOR' && !d.retificadaPor && (
              <Link to={`/monitoria/${d.id}/feedback`}>
                <Botao icone={<Presentation className="size-4" aria-hidden />}>Apresentar feedback</Botao>
              </Link>
            )}
          </>
        }
      />

      {d.retificadaPor && (
        <div className="mb-6">
          <Aviso tipo="alerta" titulo="Esta monitoria foi retificada">
            Em {fmtDataHora(d.retificadaPor.criadaEm)}, por {d.retificadaPor.avaliador}. Esta versão continua registrada
            como histórico, mas saiu das listas e das estatísticas.{' '}
            <Link to={`/monitoria/${d.retificadaPor.id}`} className="font-semibold underline">
              Ver a versão vigente
            </Link>
          </Aviso>
        </div>
      )}
      {d.retificacao && (
        <div className="mb-6">
          <Aviso tipo="info" titulo="Monitoria retificada (editada)">
            <span className="block">
              Motivo registrado: <span className="font-medium">“{d.retificacao.motivo}”</span>
            </span>
            <Link to={`/monitoria/${d.retificacao.originalId}`} className="font-semibold underline">
              Ver a versão original
            </Link>
          </Aviso>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-6">
          <Cartao className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-borda px-4 py-3">
              <Rotulo>Respostas</Rotulo>
              <span className="text-xs text-fg-3">Checklist versão {d.versaoChecklist}</span>
            </div>
            <ul className="divide-y divide-borda">
              {d.respostas.map((r) => (
                <li key={r.pergunta} className="flex items-center gap-4 px-4 py-3">
                  <span
                    className={cx(
                      'grid size-8 shrink-0 place-items-center rounded-lg',
                      r.resposta === 'SIM' ? 'bg-excelente-bg text-excelente' : r.resposta === 'NAO' ? 'bg-critico-bg text-critico' : 'bg-card-hover text-fg-3',
                    )}
                  >
                    {r.resposta === 'SIM' ? <Check className="size-4" aria-label="Sim" /> : r.resposta === 'NAO' ? <X className="size-4" aria-label="Não" /> : <Minus className="size-4" aria-label="Não se aplica" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{r.pergunta}</span>
                    {r.descricao && <span className="block text-xs text-fg-3">{r.descricao}</span>}
                    {r.observacao && (
                      <span className="mt-1.5 flex gap-1.5 rounded-lg bg-card-hover px-2.5 py-1.5 text-xs text-fg-2">
                        <MessageSquareText className="mt-px size-3.5 shrink-0 text-marca-texto" aria-hidden />
                        <span className="whitespace-pre-wrap">{r.observacao}</span>
                      </span>
                    )}
                  </span>
                  <span className="num shrink-0 text-right text-sm">
                    <span className="block font-semibold">{r.resposta === 'NA' ? '—' : `${fmtNota(r.pontos)} pts`}</span>
                    <span className="block text-[11px] text-fg-3">
                      peso {r.pesoOriginal}
                      {r.resposta !== 'NA' && Math.abs(r.pesoEfetivo - r.pesoOriginal) > 0.01 && ` → ${fmtNota(r.pesoEfetivo)}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Cartao>

          {d.feedbacks.length > 0 && (
            <section aria-labelledby="fb">
              <h2 id="fb" className="mb-3">
                <Rotulo>Feedbacks realizados</Rotulo>
              </h2>
              <ol className="flex flex-col gap-3">
                {d.feedbacks.map((f) => (
                  <li key={f.id}>
                    <Cartao as="article" className="flex flex-col gap-3 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {fmtDataHora(f.realizadoEm)} <span className="font-normal text-fg-3">· por {f.autor}</span>
                        </p>
                        {f.autoavaliacao !== null && (
                          <span className="num rounded-full bg-card-hover px-2.5 py-1 text-xs text-fg-2">
                            Autoavaliação <strong className="text-fg">{fmtNota(f.autoavaliacao / 10)}</strong>/10 · monitoria{' '}
                            <strong className="text-fg">{fmtNota(d.nota / 10)}</strong>/10
                          </span>
                        )}
                      </div>
                      {[
                        ['Pontos fortes', f.pontosFortes],
                        ['A melhorar', f.pontosMelhorar],
                        ['Combinados', f.combinados],
                      ].map(([rotulo, texto]) =>
                        texto ? (
                          <div key={rotulo}>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-3">{rotulo}</p>
                            <p className="mt-0.5 whitespace-pre-wrap text-sm">{texto}</p>
                          </div>
                        ) : null,
                      )}
                      <Galeria ids={f.imagens} />
                    </Cartao>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section aria-labelledby="obs">
            <h2 id="obs" className="mb-3 flex items-center gap-2">
              <Rotulo>Observações</Rotulo>
              <span className="flex items-center gap-1 text-[11px] text-fg-3">
                <Lock className="size-3" aria-hidden /> não podem ser apagadas
              </span>
            </h2>
            {d.observacoes.length === 0 ? (
              <p className="mb-4 text-sm text-fg-3">Nenhuma observação ainda.</p>
            ) : (
              <ol className="mb-4 flex flex-col gap-3">
                {d.observacoes.map((o) => (
                  <li key={o.id}>
                    <Cartao as="article" className="flex flex-col gap-3 p-4">
                      {o.texto && <p className="whitespace-pre-wrap text-sm leading-relaxed">{o.texto}</p>}
                      <Galeria ids={o.imagens} />
                      <p className="text-xs text-fg-3">
                        {o.autor} · {fmtDataHora(o.criadaEm)}
                      </p>
                    </Cartao>
                  </li>
                ))}
              </ol>
            )}
            {d.podeObservar && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (texto.trim().length >= 3 || imagens.length) observar.mutate();
                }}
                className="flex flex-col gap-2"
              >
                <label htmlFor="nova-obs" className="text-sm font-medium">
                  Complementar
                </label>
                <AreaComImagens arquivos={imagens} onArquivos={setImagens}>
                  <textarea
                    id="nova-obs"
                    rows={3}
                    maxLength={4000}
                    className="campo resize-y"
                    placeholder="Ex.: feedback dado ao vendedor em 12/09, combinado reforçar o upselling."
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                  />
                </AreaComImagens>
                {observar.error && <Aviso>{mensagemDeErro(observar.error)}</Aviso>}
                <Botao type="submit" className="self-end" carregando={observar.isPending} disabled={texto.trim().length < 3 && !imagens.length}>
                  Adicionar observação
                </Botao>
              </form>
            )}
          </section>
        </div>

        <aside className="lg:sticky lg:top-24">
          <Cartao className="flex flex-col items-center gap-4 p-6 text-center">
            <Rotulo>Nota</Rotulo>
            <Anel valor={d.nota} tamanho={148} espessura={12} cor={COR[d.faixa]} rotulo={`Nota ${fmtNota(d.nota)}`}>
              <span className="num font-display text-4xl font-semibold">{fmtNota(d.nota)}</span>
            </Anel>
            <SeloFaixa faixa={d.faixa} />
            <p className="text-xs text-fg-2">{FAIXAS[d.faixa].acao}</p>
            <p className="border-t border-borda pt-3 text-[11px] leading-relaxed text-fg-3">
              Registrada em {fmtDataHora(d.criadaEm)}. A nota fica congelada com a versão do checklist usada no registro.
            </p>
          </Cartao>
        </aside>
      </div>
    </>
  );
}
