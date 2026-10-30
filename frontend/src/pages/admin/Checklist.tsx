import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { validarPesos } from '@motor';
import { api } from '@/lib/api';
import { fmtData } from '@/lib/formato';
import type { Slug, TipoResposta, VersaoChecklist } from '@/lib/tipos';
import { Aviso, Botao, CarregandoTela, Cartao, cx, ErroTela, mensagemDeErro, Rotulo } from '@/components/ui';

interface Rascunho {
  chave: number;
  texto: string;
  descricao: string;
  tipoResposta: TipoResposta;
  peso: number;
  mensagemSim: string;
  mensagemNao: string;
}

let proximaChave = 1;
const deVersao = (v: VersaoChecklist): Rascunho[] =>
  v.perguntas.map((p) => ({
    chave: proximaChave++,
    texto: p.texto,
    descricao: p.descricao ?? '',
    tipoResposta: p.tipoResposta,
    peso: p.peso,
    mensagemSim: p.mensagemSim ?? '',
    mensagemNao: p.mensagemNao ?? '',
  }));

/**
 * Editor do checklist — escopo §3.5 e regra 2.
 *
 * Nada é editado no lugar: salvar publica a PRÓXIMA versão. As monitorias já
 * registradas continuam com a versão (e a nota) de quando foram feitas.
 */
export function AdminChecklist({ slug }: { slug: Slug }) {
  const cliente = useQueryClient();
  const versoes = useQuery({
    queryKey: ['checklist-versoes', slug],
    queryFn: () => api.get<VersaoChecklist[]>(`/api/checklists/${slug}/versoes`),
  });
  const vigente = versoes.data?.find((v) => v.ativa);
  const [itens, setItens] = useState<Rascunho[]>([]);

  useEffect(() => {
    if (vigente) setItens(deVersao(vigente));
  }, [vigente]);

  const publicar = useMutation({
    mutationFn: () =>
      api.post<VersaoChecklist>(`/api/checklists/${slug}/versoes`, {
        perguntas: itens.map(({ texto, descricao, tipoResposta, peso, mensagemSim, mensagemNao }) => ({
          texto: texto.trim(),
          descricao: descricao.trim() || null,
          tipoResposta,
          peso,
          mensagemSim: mensagemSim.trim() || null,
          mensagemNao: mensagemNao.trim() || null,
        })),
      }),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['checklist-versoes', slug] });
      cliente.invalidateQueries({ queryKey: ['checklist', slug] });
    },
  });

  if (versoes.isPending) return <CarregandoTela />;
  if (versoes.error) return <ErroTela erro={versoes.error} onTentar={() => versoes.refetch()} />;

  const soma = itens.reduce((s, i) => s + (Number.isFinite(i.peso) ? i.peso : 0), 0);
  const problemaPesos = validarPesos(itens);
  const textoInvalido = itens.some((i) => i.texto.trim().length < 3);
  const alterado = vigente ? JSON.stringify(deVersaoSemChave(itens)) !== JSON.stringify(deVersaoSemChave(deVersao(vigente))) : itens.length > 0;

  const atualizar = (chave: number, dados: Partial<Rascunho>) => setItens((a) => a.map((i) => (i.chave === chave ? { ...i, ...dados } : i)));
  const mover = (indice: number, delta: number) =>
    setItens((a) => {
      const b = [...a];
      const [x] = b.splice(indice, 1);
      b.splice(indice + delta, 0, x);
      return b;
    });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-fg-2">
            {vigente ? `Versão ${vigente.numero} vigente desde ${fmtData(vigente.vigenteDesde)}.` : 'Nenhuma versão publicada.'} Alterar critérios ou pesos publica uma nova versão.
          </p>
        </div>
        <span className={cx('num rounded-full px-3 py-1 text-sm font-semibold', soma === 100 ? 'bg-excelente-bg text-excelente' : 'bg-critico-bg text-critico')} aria-live="polite">
          Soma dos pesos: {soma}/100
        </span>
      </div>

      <Cartao className="overflow-hidden">
        <div className="hidden items-center gap-3 border-b border-borda px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-3 lg:grid lg:grid-cols-[2rem_minmax(14rem,1.3fr)_minmax(12rem,1fr)_auto_6.5rem_auto]">
          <span>Nº</span>
          <span>Critério</span>
          <span>Descrição</span>
          <span>Não se aplica</span>
          <span>Peso</span>
          <span className="w-24" />
        </div>
        <ol className="divide-y divide-borda">
          {itens.map((i, indice) => (
            <li key={i.chave} className="grid items-center gap-x-3 gap-y-2 px-4 py-3 lg:grid-cols-[2rem_minmax(14rem,1.3fr)_minmax(12rem,1fr)_auto_6.5rem_auto]">
              <span className="num hidden text-sm font-semibold text-fg-3 lg:block">{indice + 1}</span>
              <label>
                <span className="sr-only">Critério {indice + 1}</span>
                <input className="campo font-medium" value={i.texto} maxLength={200} placeholder={`Critério ${indice + 1}`} onChange={(e) => atualizar(i.chave, { texto: e.target.value })} />
              </label>
              <label>
                <span className="sr-only">Descrição do critério {indice + 1}</span>
                <input className="campo text-sm" value={i.descricao} maxLength={500} placeholder="Descrição (opcional)" onChange={(e) => atualizar(i.chave, { descricao: e.target.value })} />
              </label>
              <label className="flex items-center gap-2 text-xs text-fg-2 lg:justify-center">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--marca)]"
                  checked={i.tipoResposta === 'SIM_NAO_NA'}
                  onChange={(e) => atualizar(i.chave, { tipoResposta: e.target.checked ? 'SIM_NAO_NA' : 'SIM_NAO' })}
                />
                <span className="lg:sr-only">Permite "Não se aplica"</span>
              </label>
              <label className="flex items-center gap-1.5 text-xs text-fg-2">
                <span className="lg:sr-only">Peso</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  className="campo num w-full py-2"
                  value={Number.isFinite(i.peso) ? i.peso : ''}
                  onChange={(e) => atualizar(i.chave, { peso: e.target.value === '' ? Number.NaN : Math.trunc(Number(e.target.value)) })}
                />
              </label>
              <span className="flex w-24 justify-end">
                <button type="button" className="grid size-8 place-items-center rounded-lg text-fg-3 hover:bg-card-hover hover:text-fg disabled:opacity-30" disabled={indice === 0} onClick={() => mover(indice, -1)} aria-label="Subir">
                  <ArrowUp className="size-4" aria-hidden />
                </button>
                <button type="button" className="grid size-8 place-items-center rounded-lg text-fg-3 hover:bg-card-hover hover:text-fg disabled:opacity-30" disabled={indice === itens.length - 1} onClick={() => mover(indice, 1)} aria-label="Descer">
                  <ArrowDown className="size-4" aria-hidden />
                </button>
                <button type="button" className="grid size-8 place-items-center rounded-lg text-fg-3 hover:bg-critico-bg hover:text-critico disabled:opacity-30" disabled={itens.length === 1} onClick={() => setItens((a) => a.filter((x) => x.chave !== i.chave))} aria-label="Remover critério">
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </span>
              {/* Mensagens mostradas à vendedora na apresentação do feedback. */}
              <div className="grid gap-2 sm:grid-cols-2 lg:col-span-6 lg:col-start-2 lg:mr-24">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-excelente">Mensagem no feedback quando atendido</span>
                  <textarea
                    rows={2}
                    maxLength={600}
                    className="campo resize-y text-sm"
                    placeholder="Ex.: Você foi cordial com o cliente e falou com respeito."
                    value={i.mensagemSim}
                    onChange={(e) => atualizar(i.chave, { mensagemSim: e.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-critico">Mensagem no feedback quando não atendido</span>
                  <textarea
                    rows={2}
                    maxLength={600}
                    className="campo resize-y text-sm"
                    placeholder="Ex.: Faltou se apresentar de forma cordial."
                    value={i.mensagemNao}
                    onChange={(e) => atualizar(i.chave, { mensagemNao: e.target.value })}
                  />
                </label>
              </div>
            </li>
          ))}
        </ol>
      </Cartao>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Botao
          variante="fantasma"
          icone={<Plus className="size-4" aria-hidden />}
          onClick={() => setItens((a) => [...a, { chave: proximaChave++, texto: '', descricao: '', tipoResposta: 'SIM_NAO', peso: Math.max(1, 100 - soma), mensagemSim: '', mensagemNao: '' }])}
          disabled={itens.length >= 30}
        >
          Adicionar critério
        </Botao>
        <div className="flex gap-2">
          {alterado && vigente && (
            <Botao variante="sutil" onClick={() => setItens(deVersao(vigente))}>
              Descartar mudanças
            </Botao>
          )}
          <Botao
            disabled={!alterado || Boolean(problemaPesos) || textoInvalido}
            carregando={publicar.isPending}
            onClick={() => {
              if (window.confirm(`Publicar a versão ${(vigente?.numero ?? 0) + 1}? As próximas monitorias usarão os novos critérios e pesos; as já registradas não mudam.`)) {
                publicar.mutate();
              }
            }}
          >
            Publicar versão {(vigente?.numero ?? 0) + 1}
          </Botao>
        </div>
      </div>
      {alterado && problemaPesos && <Aviso tipo="alerta">{problemaPesos}</Aviso>}
      {alterado && textoInvalido && <Aviso tipo="alerta">Todo critério precisa de um texto com pelo menos 3 caracteres.</Aviso>}
      {publicar.error && <Aviso>{mensagemDeErro(publicar.error)}</Aviso>}
      {publicar.isSuccess && !alterado && <Aviso tipo="info">Versão {publicar.data.numero} publicada.</Aviso>}

      {versoes.data.length > 1 && (
        <section aria-labelledby="versoes" className="mt-2">
          <h3 id="versoes" className="mb-2">
            <Rotulo>Versões anteriores</Rotulo>
          </h3>
          <ul className="flex flex-col gap-1 text-sm text-fg-2">
            {versoes.data
              .filter((v) => !v.ativa)
              .map((v) => (
                <li key={v.id}>
                  Versão {v.numero} · desde {fmtData(v.vigenteDesde)}
                  {v.criadaPor ? ` · por ${v.criadaPor.nome}` : ''} · {v._count?.monitorias ?? 0} monitoria(s) · {v.perguntas.length} critérios
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function deVersaoSemChave(itens: Rascunho[]) {
  return itens.map(({ texto, descricao, tipoResposta, peso, mensagemSim, mensagemNao }) => [texto.trim(), descricao.trim(), tipoResposta, peso, mensagemSim.trim(), mensagemNao.trim()]);
}
