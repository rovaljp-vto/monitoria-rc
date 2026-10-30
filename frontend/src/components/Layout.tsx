import { useEffect, useState, type ComponentType } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  ChartColumn,
  ClipboardCheck,
  ClipboardList,
  House,
  ListChecks,
  LogOut,
  Menu,
  PlusCircle,
  SlidersHorizontal,
  Store,
  ScrollText,
  Target,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { MODULOS } from '@/lib/modulos';
import { pode, useEu } from '@/lib/sessao';
import { iniciais } from '@/lib/formato';
import { PERM, type Eu, type Slug } from '@/lib/tipos';
import { AlternarTema, cx, Dica, EASE } from './ui';
import { MarcaTopo } from './Marca';

export function useSair() {
  const navigate = useNavigate();
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/api/logout'),
    onSettled: () => {
      cliente.clear();
      navigate('/entrar', { replace: true });
    },
  });
}

export function MenuUsuario() {
  const { data: eu } = useEu();
  const sair = useSair();
  if (!eu) return null;
  return (
    <div className="flex items-center gap-2">
      <span
        className="hidden size-9 place-items-center rounded-full bg-marca-suave text-xs font-bold text-marca-texto sm:grid"
        aria-hidden
      >
        {iniciais(eu.nome)}
      </span>
      <span className="hidden max-w-40 truncate text-sm font-medium md:block" title={eu.nome}>
        {eu.nome}
      </span>
      <Dica titulo="Sair" texto="Encerra a sessão neste navegador. Para voltar, entre pelo RovalConnecta." alinhar="fim">
        <button
          type="button"
          onClick={() => sair.mutate()}
          className="grid size-10 place-items-center rounded-full text-fg-2 transition hover:bg-card hover:text-fg"
          aria-label="Sair"
        >
          <LogOut className="size-[18px]" aria-hidden />
        </button>
      </Dica>
    </div>
  );
}

interface ItemMenu {
  para: string;
  rotulo: string;
  icone: ComponentType<{ className?: string }>;
  /** Ativo só na rota exata (a raiz do grupo não acende em todas as filhas). */
  exato?: boolean;
}

/** Telas de um módulo — as mesmas nos dois, só muda o prefixo. */
function itensDoModulo(eu: Eu | undefined, slug: Slug): ItemMenu[] {
  const m = MODULOS[slug];
  return [
    // A ação do dia a dia vem primeiro.
    ...(pode(eu, m.perm.registrar) ? [{ para: `/${slug}/nova`, rotulo: 'Nova monitoria', icone: PlusCircle }] : []),
    { para: `/${slug}/dashboard`, rotulo: 'Dashboard', icone: ChartColumn },
    { para: `/${slug}`, rotulo: 'Cobertura do mês', icone: ClipboardCheck, exato: true },
    { para: `/${slug}/foco`, rotulo: 'Foco', icone: Target },
    { para: `/${slug}/monitorias`, rotulo: 'Monitorias', icone: ClipboardList },
  ];
}

const CHAVE_MODULO = 'monitoria:modulo-menu';
const EVENTO_MODULO = 'monitoria:modulo-da-tela';

/** Uma tela declara a que módulo pertence (ex.: detalhe de monitoria). */
export function useModuloDaTela(slug: Slug | null | undefined) {
  useEffect(() => {
    if (slug) window.dispatchEvent(new CustomEvent(EVENTO_MODULO, { detail: slug }));
  }, [slug]);
}

/**
 * Qual módulo o menu mostra. Nas telas de um módulo, é o da URL; fora delas
 * (início, administração, detalhe), o último escolhido — guardado no navegador.
 */
function useModuloDoMenu(eu: Eu | undefined): [Slug | null, (s: Slug) => void, Slug[]] {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const liberados = (Object.keys(MODULOS) as Slug[]).filter((s) => pode(eu, MODULOS[s].perm.ver));
  const daUrl = pathname.split('/')[1];
  const [escolhido, setEscolhido] = useState<Slug | null>(() => {
    try {
      return localStorage.getItem(CHAVE_MODULO) as Slug | null;
    } catch {
      return null;
    }
  });

  const naUrl = liberados.includes(daUrl as Slug) ? (daUrl as Slug) : null;
  const atual = naUrl ?? (escolhido && liberados.includes(escolhido) ? escolhido : (liberados[0] ?? null));

  useEffect(() => {
    if (!naUrl) return;
    setEscolhido(naUrl);
    try {
      localStorage.setItem(CHAVE_MODULO, naUrl);
    } catch {
      /* só não lembra na próxima visita */
    }
  }, [naUrl]);

  const trocar = (s: Slug) => {
    setEscolhido(s);
    try {
      localStorage.setItem(CHAVE_MODULO, s);
    } catch {
      /* idem */
    }
    // Dentro de um módulo, troca mantendo a mesma tela (Foco → Foco).
    // "Nova monitoria" só troca se a pessoa também pode registrar no outro.
    if (naUrl && naUrl !== s) {
      const resto = pathname.slice(naUrl.length + 1);
      const podeResto = resto === '/nova' ? pode(eu, MODULOS[s].perm.registrar) : !resto.startsWith('/alvo');
      navigate(`/${s}${podeResto ? resto : ''}`);
    } else if (!naUrl && pathname.startsWith('/monitoria/') && s !== atual) {
      // Numa monitoria (que é de UM módulo), trocar de módulo leva para a
      // lista de monitorias do outro — continua no mesmo contexto.
      navigate(`/${s}/monitorias`);
    }
  };

  // Telas que pertencem a um módulo sem tê-lo na URL (detalhe de monitoria)
  // avisam qual é — o seletor e a cor acompanham.
  useEffect(() => {
    const ouvir = (e: Event) => {
      const s = (e as CustomEvent<Slug>).detail;
      if (liberados.includes(s)) setEscolhido(s);
    };
    window.addEventListener(EVENTO_MODULO, ouvir);
    return () => window.removeEventListener(EVENTO_MODULO, ouvir);
  }, [liberados.join()]);

  return [atual, trocar, liberados];
}

/** Grupo de administração do menu lateral. */
function grupoAdmin(eu: Eu | undefined): { titulo: string; itens: ItemMenu[] }[] {
  const grupos = [];
  if (pode(eu, PERM.CADASTROS)) {
    grupos.push({
      titulo: 'Administração',
      itens: [
        { para: '/admin/lojas', rotulo: 'Lojas', icone: Store },
        { para: '/admin/vendedores', rotulo: 'Vendedores', icone: Users },
        { para: '/admin/checklist-vendedores', rotulo: 'Checklist de vendedores', icone: ListChecks },
        { para: '/admin/checklist-lojas', rotulo: 'Checklist de lojas', icone: ListChecks },
        { para: '/admin/parametros', rotulo: 'Faixas e metas', icone: SlidersHorizontal },
        { para: '/admin/usuarios', rotulo: 'Usuários', icone: UserCog },
        // Só o administrador vindo do RovalConnecta vê a auditoria.
        ...(eu?.adminLocal ? [{ para: '/admin/auditoria', rotulo: 'Auditoria', icone: ScrollText }] : []),
      ],
    });
  }
  return grupos;
}

/**
 * Casca das telas internas — mesmo desenho do Chamados TI: cabeçalho de ponta a
 * ponta e barra lateral encostada na borda, com os itens agrupados por módulo.
 * No celular a barra vira um painel aberto pelo botão ☰.
 */
export function LayoutInterno() {
  const { data: eu } = useEu();
  const { pathname } = useLocation();
  const [menuAberto, setMenuAberto] = useState(false);

  // Trocou de tela pelo menu no celular: o painel fecha sozinho.
  useEffect(() => setMenuAberto(false), [pathname]);

  const grupos = grupoAdmin(eu);
  const [modulo, trocarModulo, liberados] = useModuloDoMenu(eu);

  // Cor de destaque por módulo (styles.css, [data-modulo='lojas']). No <html>
  // para valer também nas dicas e ampliações, que abrem fora desta árvore.
  useEffect(() => {
    if (modulo) document.documentElement.dataset.modulo = modulo;
    return () => {
      delete document.documentElement.dataset.modulo;
    };
  }, [modulo]);

  return (
    <div className="min-h-dvh">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-marca focus:px-3 focus:py-2 focus:text-xs focus:text-white"
      >
        Ir para o conteúdo
      </a>

      <header className="sticky top-0 z-30 border-b border-borda bg-bg">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-5">
          <button
            type="button"
            className="grid size-10 place-items-center rounded-lg text-fg-2 transition hover:bg-card hover:text-fg md:hidden"
            aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={menuAberto}
            aria-controls="menu-lateral"
            onClick={() => setMenuAberto((a) => !a)}
          >
            {menuAberto ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
          <MarcaTopo />
          <div className="ml-auto flex items-center gap-1">
            <AlternarTema className="size-9" />
            <MenuUsuario />
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100dvh-4rem)]">
        <nav
          id="menu-lateral"
          aria-label="Navegação principal"
          className={cx(
            'sem-barra shrink-0 border-r border-borda md:block md:w-64 md:bg-card',
            // Aberto no celular: fundo OPACO — o translúcido do desktop deixava a página aparecer por trás.
            menuAberto ? 'fixed inset-x-0 bottom-0 top-16 z-20 overflow-y-auto overscroll-contain bg-bg' : 'hidden',
          )}
        >
          {/* 65px = cabeçalho (h-16) + 1px de borda: o menu prende exatamente embaixo dele. */}
          <div className="sem-barra flex flex-col gap-6 px-4 py-6 md:sticky md:top-[65px] md:max-h-[calc(100dvh-65px)] md:overflow-y-auto">
            <ul>
              <li>
                <ItemLink item={{ para: '/', rotulo: 'Início', icone: House, exato: true }} />
              </li>
            </ul>
            {modulo && (
              <div className="flex flex-col gap-2">
                {liberados.length > 1 ? (
                  <SeletorModulo atual={modulo} opcoes={liberados} onTrocar={trocarModulo} />
                ) : (
                  <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-3">{MODULOS[modulo].curto}</p>
                )}
                <AnimatePresence mode="wait" initial={false}>
                  <motion.ul
                    key={modulo}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 6 }}
                    transition={{ duration: 0.18, ease: EASE }}
                    className="flex flex-col gap-0.5"
                  >
                    {itensDoModulo(eu, modulo).map((item) => (
                      <li key={item.para}>
                        <ItemLink item={item} />
                      </li>
                    ))}
                  </motion.ul>
                </AnimatePresence>
              </div>
            )}
            {grupos.map((g) => (
              <div key={g.titulo} className="flex flex-col gap-1.5">
                <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-3">{g.titulo}</p>
                <ul className="flex flex-col gap-0.5">
                  {g.itens.map((item) => (
                    <li key={item.para}>
                      <ItemLink item={item} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <main id="conteudo" className="min-w-0 flex-1">
          <div className="mx-auto max-w-[1600px] px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:px-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

/** [Vendedores | Lojas] — a pílula vermelha desliza para o lado escolhido. */
function SeletorModulo({ atual, opcoes, onTrocar }: { atual: Slug; opcoes: Slug[]; onTrocar: (s: Slug) => void }) {
  return (
    <div role="tablist" aria-label="Módulo" className="grid grid-cols-2 gap-1 rounded-xl border border-borda bg-card-hover p-1">
      {opcoes.map((s) => {
        const ativo = s === atual;
        const Icone = s === 'vendedores' ? Users : Store;
        return (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={ativo}
            onClick={() => onTrocar(s)}
            className={cx(
              'relative flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[13px] font-semibold transition-colors',
              ativo ? 'text-white' : 'text-fg-2 hover:text-fg',
            )}
          >
            {ativo && (
              <motion.span
                layoutId="seletor-modulo"
                className="absolute inset-0 rounded-lg bg-gradient-to-br from-marca to-marca-forte shadow-marca"
                transition={{ duration: 0.3, ease: EASE }}
              />
            )}
            <Icone className="relative size-4 shrink-0" aria-hidden />
            <span className="relative">{MODULOS[s].curto}</span>
          </button>
        );
      })}
    </div>
  );
}

function ItemLink({ item }: { item: ItemMenu }) {
  const Icone = item.icone;
  return (
    <NavLink
      to={item.para}
      end={item.exato}
      className={({ isActive }) =>
        cx(
          'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
          isActive ? 'bg-card-hover text-fg' : 'text-fg-2 hover:bg-card-hover hover:text-fg',
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* Item ativo: barra vermelha à esquerda — posição + cor, nunca só cor. */}
          {isActive && (
            <motion.span
              layoutId="menu-ativo"
              className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full bg-marca"
              transition={{ duration: 0.3, ease: EASE }}
            />
          )}
          <Icone className={cx('size-[18px] shrink-0 transition-colors', isActive ? 'text-marca' : 'text-fg-3 group-hover:text-fg-2')} />
          <span className="flex-1 truncate">{item.rotulo}</span>
        </>
      )}
    </NavLink>
  );
}

/**
 * Volta para a tela anterior do próprio sistema. Se a pessoa abriu o link
 * direto (sem histórico aqui dentro), vai para `alternativa`.
 */
function BotaoVoltar({ alternativa }: { alternativa: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
        if (idx > 0) navigate(-1);
        else navigate(alternativa);
      }}
      className="-ml-2 mb-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-fg-2 transition hover:bg-card hover:text-fg"
    >
      <ArrowLeft className="size-4" aria-hidden /> Voltar
    </button>
  );
}

/** Título de página com descrição e ações à direita. */
export function Cabecalho({
  titulo,
  sobre,
  descricao,
  acoes,
  voltar,
}: {
  titulo: string;
  sobre?: string;
  descricao?: React.ReactNode;
  acoes?: React.ReactNode;
  /** Mostra "Voltar"; o valor é o destino quando não há tela anterior. */
  voltar?: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {voltar && <BotaoVoltar alternativa={voltar} />}
        {sobre && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-marca-texto">{sobre}</p>}
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{titulo}</h1>
        {descricao && <p className="mt-2 max-w-2xl text-sm text-fg-2">{descricao}</p>}
      </div>
      {acoes && <div className="flex shrink-0 flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}
