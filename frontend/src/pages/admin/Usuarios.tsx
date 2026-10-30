import { useQuery } from '@tanstack/react-query';
import { Link2, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDataHora } from '@/lib/formato';
import type { UsuarioLocal } from '@/lib/tipos';
import { Aviso, CarregandoTela, cx, ErroTela, Vazio, Cartao } from '@/components/ui';

const ESTADO: Record<UsuarioLocal['estado'], { rotulo: string; classe: string }> = {
  ATIVO: { rotulo: 'Ativo', classe: 'bg-excelente-bg text-excelente' },
  PENDENTE: { rotulo: 'Sem permissões', classe: 'bg-regular-bg text-regular' },
  BLOQUEADO: { rotulo: 'Bloqueado', classe: 'bg-critico-bg text-critico' },
  EXCLUIDO: { rotulo: 'Acesso removido', classe: 'bg-card-hover text-fg-3' },
};

/**
 * Usuários replicados do RovalConnecta — somente leitura (GUIA-INTEGRACAO
 * §13.2, item 5). Conceder ou revogar é feito no hub.
 */
export function AdminUsuarios() {
  const q = useQuery({ queryKey: ['usuarios'], queryFn: () => api.get<UsuarioLocal[]>('/api/usuarios') });

  if (q.isPending) return <CarregandoTela />;
  if (q.error) return <ErroTela erro={q.error} onTentar={() => q.refetch()} />;

  return (
    <div className="flex flex-col gap-4">
      <Aviso tipo="info" titulo="Gerenciado pelo RovalConnecta">
        Os usuários chegam pela replicação do hub. Para liberar o sistema ou mudar permissões, use Usuários → Permissões → Checklist
        Comercial no RovalConnecta. A mudança vale aqui na próxima ação da pessoa.
      </Aviso>
      {q.data.length === 0 ? (
        <Vazio titulo="Nenhum usuário replicado ainda" />
      ) : (
        <Cartao className="overflow-hidden">
          <div className="hidden items-center gap-4 border-b border-borda px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-3 lg:grid lg:grid-cols-[minmax(12rem,1.5fr)_minmax(10rem,1fr)_10rem_8rem]">
            <span>Nome</span>
            <span>Usuário · lotação</span>
            <span>Último acesso</span>
            <span>Situação</span>
          </div>
          <ul className="divide-y divide-borda">
            {q.data.map((u) => (
              <li key={u.id} className="grid items-center gap-2 px-4 py-3 lg:gap-4 lg:grid-cols-[minmax(12rem,1.5fr)_minmax(10rem,1fr)_10rem_8rem]">
                <span className="flex min-w-0 items-center gap-2 font-medium">
                  <span className="truncate">{u.nome}</span>
                  {u.isAdminLocal && <ShieldCheck className="size-4 shrink-0 text-marca-texto" aria-label="Administrador local" />}
                  {u.linkedToRoval && <Link2 className="size-3.5 shrink-0 text-fg-3" aria-label="Vinculado ao RovalConnecta" />}
                </span>
                <span className="min-w-0 truncate text-xs text-fg-3">
                  {u.username}
                  {u.filial && ` · ${u.filial}`}
                  {u.setor && ` · ${u.setor}`}
                </span>
                <span className="num text-xs text-fg-3">{u.ultimoAcessoEm ? fmtDataHora(u.ultimoAcessoEm) : '—'}</span>
                <span className={cx('justify-self-start rounded-full px-2.5 py-1 text-xs font-semibold', ESTADO[u.estado].classe)}>{ESTADO[u.estado].rotulo}</span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </div>
  );
}
