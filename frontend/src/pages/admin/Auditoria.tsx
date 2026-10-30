import { Navigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useEu } from '@/lib/sessao';
import { fmtDataHora, fmtNota } from '@/lib/formato';
import { Botao, CarregandoTela, Cartao, cx, ErroTela, Vazio } from '@/components/ui';

interface Registro {
  id: string;
  acao: string;
  atorNome: string | null;
  alvo: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  criadoEm: string;
}

const GRUPOS = [
  { id: '', rotulo: 'Tudo' },
  { id: 'acesso', rotulo: 'Acessos' },
  { id: 'monitorias', rotulo: 'Monitorias' },
  { id: 'cadastros', rotulo: 'Cadastros' },
  { id: 'integracao', rotulo: 'Integração' },
];

const TIPO: Record<string, string> = { VENDEDOR: 'vendedor', LOJA: 'loja' };

/** A ação gravada no banco, contada em português. */
function descrever(r: Registro): { titulo: string; detalhe?: string; tom: 'normal' | 'alerta' } {
  const m = (r.metadata ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  switch (r.acao) {
    case 'sso.login':
      return { titulo: 'Entrou no sistema pelo RovalConnecta', tom: 'normal' };
    case 'sso.recusado': {
      const motivos: Record<string, string> = {
        'sem-permissoes': 'sem permissões neste sistema',
        'usuario-inexistente': 'usuário ainda não replicado',
        bloqueado: 'usuário bloqueado',
        excluido: 'acesso removido',
        expirado: 'link expirado',
        assinatura: 'assinatura inválida',
        'token-reutilizado': 'link já utilizado',
      };
      return { titulo: 'Entrada recusada', detalhe: motivos[s(m.motivo)] ?? s(m.motivo), tom: 'alerta' };
    }
    case 'monitoria.registrar':
      return { titulo: `Registrou monitoria de ${TIPO[s(m.tipo)] ?? ''}`, detalhe: `nota ${fmtNota(Number(m.nota))}`, tom: 'normal' };
    case 'monitoria.observacao':
      return { titulo: 'Adicionou observação a uma monitoria', tom: 'normal' };
    case 'monitoria.observacao.imagens':
      return { titulo: 'Anexou imagens a uma observação', detalhe: `${s(m.quantidade)} imagem(ns)`, tom: 'normal' };
    case 'monitoria.feedback':
      return { titulo: 'Registrou feedback', detalhe: m.autoavaliacao !== null && m.autoavaliacao !== undefined ? `autoavaliação ${Number(m.autoavaliacao) / 10}` : undefined, tom: 'normal' };
    case 'monitoria.feedback.imagens':
      return { titulo: 'Anexou imagens a um feedback', detalhe: `${s(m.quantidade)} imagem(ns)`, tom: 'normal' };
    case 'vendedor.criar':
      return { titulo: 'Cadastrou vendedor(a)', detalhe: s(m.nome), tom: 'normal' };
    case 'vendedor.editar':
      return { titulo: 'Alterou cadastro de vendedor(a)', tom: 'normal' };
    case 'vendedor.transferir':
      return { titulo: 'Transferiu vendedor(a) de loja', detalhe: `${s(m.de) || '—'} → ${s(m.para)} a partir de ${s(m.data).split('-').reverse().join('/')}`, tom: 'normal' };
    case 'vendedor.transferencia.remover':
      return { titulo: 'Desfez uma transferência', detalhe: s(m.loja), tom: 'alerta' };
    case 'loja.criar':
      return { titulo: 'Cadastrou loja', detalhe: s(m.nome), tom: 'normal' };
    case 'loja.editar':
      return { titulo: 'Alterou cadastro de loja', tom: 'normal' };
    case 'checklist.nova-versao':
      return { titulo: `Publicou nova versão do checklist de ${TIPO[s(m.tipo)] ?? ''}`, detalhe: `versão ${s(m.numero)}`, tom: 'normal' };
    case 'parametros.editar':
      return { titulo: 'Alterou faixas e metas', tom: 'normal' };
    case 'sync.admin.vinculado':
      return { titulo: 'Administrador do RovalConnecta vinculado', tom: 'normal' };
    case 'sync.admin.desvinculado':
      return { titulo: 'Administrador do RovalConnecta desvinculado', tom: 'alerta' };
    case 'sync.user.disable':
      return { titulo: 'Usuário bloqueado pelo RovalConnecta', tom: 'alerta' };
    case 'sync.user.delete':
      return { titulo: 'Acesso removido pelo RovalConnecta', tom: 'alerta' };
    default:
      return { titulo: r.acao, tom: 'normal' };
  }
}

/** Auditoria — exclusiva do administrador vindo do RovalConnecta. */
export function AdminAuditoria() {
  const { data: eu } = useEu();
  const [busca, setBusca] = useSearchParams();
  const grupo = busca.get('grupo') ?? '';
  const de = busca.get('de') ?? '';
  const ate = busca.get('ate') ?? '';
  const quem = busca.get('quem') ?? '';
  const pagina = Math.max(1, Number(busca.get('pagina')) || 1);

  const filtrar = (chave: string, valor: string) => {
    const n = new URLSearchParams(busca);
    if (valor) n.set(chave, valor);
    else n.delete(chave);
    if (chave !== 'pagina') n.delete('pagina');
    setBusca(n, { replace: true });
  };

  const q = useQuery({
    queryKey: ['auditoria', grupo, de, ate, quem, pagina],
    queryFn: () => api.get<{ total: number; pagina: number; porPagina: number; itens: Registro[] }>('/api/auditoria', { grupo, de, ate, busca: quem, pagina }),
    placeholderData: keepPreviousData,
    enabled: Boolean(eu?.adminLocal),
  });

  if (eu && !eu.adminLocal) return <Navigate to="/admin/lojas" replace />;

  const paginas = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.porPagina)) : 1;
  const COLS = 'lg:grid-cols-[10.5rem_minmax(10rem,1fr)_minmax(16rem,2fr)_minmax(10rem,1.3fr)]';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-borda bg-card p-1" role="group" aria-label="Tipo de ação">
          {GRUPOS.map((g) => (
            <button
              key={g.id || 'tudo'}
              type="button"
              onClick={() => filtrar('grupo', g.id)}
              aria-pressed={grupo === g.id}
              className={cx('rounded-lg px-3 py-1.5 text-xs font-semibold transition', grupo === g.id ? 'bg-marca text-white shadow-marca' : 'text-fg-2 hover:text-fg')}
            >
              {g.rotulo}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-fg-2">
          De
          <input type="date" className="campo w-40 py-2" value={de} onChange={(e) => filtrar('de', e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-xs text-fg-2">
          até
          <input type="date" className="campo w-40 py-2" value={ate} onChange={(e) => filtrar('ate', e.target.value)} />
        </label>
        <label className="relative ml-auto">
          <span className="sr-only">Buscar por quem fez</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
          <input className="campo w-56 py-2 pl-9" placeholder="Quem fez" value={quem} onChange={(e) => filtrar('quem', e.target.value)} />
        </label>
      </div>

      {q.isPending ? (
        <CarregandoTela />
      ) : q.error ? (
        <ErroTela erro={q.error} onTentar={() => q.refetch()} />
      ) : q.data.itens.length === 0 ? (
        <Vazio titulo="Nenhum registro com esses filtros" />
      ) : (
        <>
          <Cartao className={cx('overflow-hidden transition-opacity', q.isPlaceholderData && 'opacity-60')}>
            <div className={cx('hidden gap-4 border-b border-borda px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-3 lg:grid', COLS)}>
              <span>Quando</span>
              <span>Quem</span>
              <span>O quê</span>
              <span>Detalhe</span>
            </div>
            <ul className="divide-y divide-borda">
              {q.data.itens.map((r) => {
                const d = descrever(r);
                return (
                  <li key={r.id} className={cx('grid gap-1 px-4 py-2.5 text-sm lg:items-center lg:gap-4', COLS)}>
                    <span className="num text-xs text-fg-3">{fmtDataHora(r.criadoEm)}</span>
                    <span className="truncate font-medium">{r.atorNome ?? <span className="text-fg-3">sistema</span>}</span>
                    <span className="flex items-center gap-2">
                      <span className={cx('size-1.5 shrink-0 rounded-full', d.tom === 'alerta' ? 'bg-regular' : 'bg-marca')} aria-hidden />
                      {d.titulo}
                    </span>
                    <span className="truncate text-xs text-fg-2">{d.detalhe ?? ''}</span>
                  </li>
                );
              })}
            </ul>
          </Cartao>
          <div className="flex items-center justify-between text-sm text-fg-2">
            <span className="num">{q.data.total} registro(s)</span>
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
    </div>
  );
}
