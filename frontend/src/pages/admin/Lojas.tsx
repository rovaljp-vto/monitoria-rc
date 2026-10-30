import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import type { Loja } from '@/lib/tipos';
import { Aviso, Botao, CarregandoTela, cx, ErroTela, mensagemDeErro, Vazio, Cartao } from '@/components/ui';

export function AdminLojas() {
  const cliente = useQueryClient();
  const q = useQuery({ queryKey: ['lojas', 'todas'], queryFn: () => api.get<Loja[]>('/api/lojas', { todas: 1 }) });
  const [nova, setNova] = useState('');
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null);

  const invalidar = () => {
    cliente.invalidateQueries({ queryKey: ['lojas'] });
    cliente.invalidateQueries({ queryKey: ['cobertura'] });
  };
  const criar = useMutation({
    mutationFn: () => api.post('/api/lojas', { nome: nova.trim(), ordem: q.data?.length ?? 0 }),
    onSuccess: () => {
      setNova('');
      invalidar();
    },
  });
  const editar = useMutation({
    mutationFn: (v: { id: string; dados: Partial<Pick<Loja, 'nome' | 'ativa'>> }) => api.patch(`/api/lojas/${v.id}`, v.dados),
    onSuccess: () => {
      setEditando(null);
      invalidar();
    },
  });

  if (q.isPending) return <CarregandoTela linhas={5} />;
  if (q.error) return <ErroTela erro={q.error} onTentar={() => q.refetch()} />;
  const erro = criar.error ?? editar.error;

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (nova.trim().length >= 2) criar.mutate();
        }}
      >
        <label className="flex-1">
          <span className="sr-only">Nome da nova loja</span>
          <input className="campo" placeholder="Nome da nova loja" value={nova} onChange={(e) => setNova(e.target.value)} maxLength={120} />
        </label>
        <Botao type="submit" carregando={criar.isPending} disabled={nova.trim().length < 2} icone={<Plus className="size-4" aria-hidden />}>
          Incluir
        </Botao>
      </form>
      {erro && <Aviso>{mensagemDeErro(erro)}</Aviso>}

      {q.data.length === 0 ? (
        <Vazio titulo="Nenhuma loja cadastrada" />
      ) : (
        <Cartao className="overflow-hidden">
          <div className="hidden items-center gap-4 border-b border-borda px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-3 md:grid md:grid-cols-[minmax(12rem,1.5fr)_minmax(12rem,1fr)_auto]">
            <span>Loja</span>
            <span>Situação</span>
            <span />
          </div>
          <ul className="divide-y divide-borda">
            {q.data.map((l) => (
              <li key={l.id} className={cx('grid items-center gap-3 px-4 py-2.5 md:grid-cols-[minmax(12rem,1.5fr)_minmax(12rem,1fr)_auto]', !l.ativa && 'opacity-60')}>
                {editando?.id === l.id ? (
                  <form
                    className="flex gap-2 md:col-span-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      editar.mutate({ id: l.id, dados: { nome: editando.nome.trim() } });
                    }}
                  >
                    <input autoFocus className="campo max-w-md py-1.5" value={editando.nome} onChange={(e) => setEditando({ id: l.id, nome: e.target.value })} aria-label="Nome da loja" />
                    <Botao type="submit" carregando={editar.isPending}>
                      Salvar
                    </Botao>
                    <Botao type="button" variante="sutil" onClick={() => setEditando(null)}>
                      Cancelar
                    </Botao>
                  </form>
                ) : (
                  <>
                    <span className="truncate font-medium">{l.nome}</span>
                    <span className="text-sm text-fg-2">
                      {l.ativa ? `Ativa · ${l._count?.vendedores ?? 0} vendedor(es) ativo(s)` : 'Inativa — fora da cobertura'}
                    </span>
                    <span className="flex items-center justify-end gap-1">
                      <button type="button" className="grid size-9 place-items-center rounded-lg text-fg-3 hover:bg-card-hover hover:text-fg" aria-label={`Renomear ${l.nome}`} onClick={() => setEditando({ id: l.id, nome: l.nome })}>
                        <Pencil className="size-4" aria-hidden />
                      </button>
                      <Botao variante="fantasma" className="min-h-9" onClick={() => editar.mutate({ id: l.id, dados: { ativa: !l.ativa } })}>
                        {l.ativa ? 'Inativar' : 'Reativar'}
                      </Botao>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </div>
  );
}
