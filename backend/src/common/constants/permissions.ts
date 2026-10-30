/**
 * Catálogo de permissões da Monitoria de Qualidade.
 *
 * FONTE DA VERDADE das chaves. Publicado em `GET /api/sync/permissions` para o
 * RovalConnecta montar os checkboxes (GUIA-INTEGRACAO-SISTEMAS.md §13.1).
 *
 * ⚠️ As chaves são ESTÁVEIS: renomear sem migrar o hub revoga o acesso de quem
 * tinha a chave antiga. Mudou o catálogo → incremente CATALOG_VERSION.
 *
 * Perfis do escopo (§2) montados a partir das chaves:
 *   Monitor(a) de Vendedores = VENDEDORES_VER + VENDEDORES_REGISTRAR + LOJAS_VER
 *   Monitor(a) de Lojas      = LOJAS_VER + LOJAS_REGISTRAR + VENDEDORES_VER
 *   Gestão                   = VENDEDORES_VER + LOJAS_VER
 *   Administrador            = CADASTROS_GERENCIAR (+ as de leitura, se for ver os módulos)
 */

export const CATALOG_VERSION = 1;

export const PERMISSOES = {
  VENDEDORES_VER: 'MON_VENDEDORES_VER',
  VENDEDORES_REGISTRAR: 'MON_VENDEDORES_REGISTRAR',
  LOJAS_VER: 'MON_LOJAS_VER',
  LOJAS_REGISTRAR: 'MON_LOJAS_REGISTRAR',
  CADASTROS_GERENCIAR: 'MON_CADASTROS_GERENCIAR',
} as const;

export type Permissao = (typeof PERMISSOES)[keyof typeof PERMISSOES];

export interface DefinicaoPermissao {
  key: Permissao;
  nome: string;
  descricao: string;
  categoria: 'Monitoria de Vendedores' | 'Monitoria de Lojas' | 'Administração';
  ordem: number;
}

export const CATALOGO: DefinicaoPermissao[] = [
  {
    key: PERMISSOES.VENDEDORES_VER,
    nome: 'Ver monitoria de vendedores',
    descricao:
      'Abrir o módulo Vendedores: cobertura do mês, lista de foco, monitorias, notas e observações. Somente leitura.',
    categoria: 'Monitoria de Vendedores',
    ordem: 1,
  },
  {
    key: PERMISSOES.VENDEDORES_REGISTRAR,
    nome: 'Registrar monitoria de vendedores',
    descricao:
      'Registrar monitorias de atendimento dos vendedores e complementar observações. Exige também "Ver monitoria de vendedores".',
    categoria: 'Monitoria de Vendedores',
    ordem: 2,
  },
  {
    key: PERMISSOES.LOJAS_VER,
    nome: 'Ver monitoria de lojas',
    descricao:
      'Abrir o módulo Lojas: cobertura do mês, lista de foco, monitorias, notas e observações. Somente leitura.',
    categoria: 'Monitoria de Lojas',
    ordem: 3,
  },
  {
    key: PERMISSOES.LOJAS_REGISTRAR,
    nome: 'Registrar monitoria de lojas',
    descricao:
      'Registrar monitorias de loja com o checklist próprio e complementar observações. Exige também "Ver monitoria de lojas".',
    categoria: 'Monitoria de Lojas',
    ordem: 4,
  },
  {
    key: PERMISSOES.CADASTROS_GERENCIAR,
    nome: 'Administrar cadastros e parâmetros',
    descricao:
      'Manter lojas, vendedores, os dois checklists (critérios e pesos), faixas de nota, metas e o dia do alerta de fim de mês.',
    categoria: 'Administração',
    ordem: 5,
  },
];

export const CHAVES_VALIDAS: ReadonlySet<string> = new Set(CATALOGO.map((p) => p.key));

/**
 * GUIA-INTEGRACAO §13.1: "defaults com o MÍNIMO útil (nunca 'tudo')".
 *
 * Vazio de propósito: diferente de um sistema que todo colaborador usa, aqui
 * ninguém precisa de acesso só por ter o card liberado. Quem recebe o sistema
 * sem permissão marcada fica PENDENTE e o SSO explica o que falta.
 */
export const PERMISSOES_PADRAO: Permissao[] = [];

/**
 * Registrar sem poder ver não chega à tela. NÃO concedemos a dependência
 * automaticamente (quebraria o replace do hub): só avisamos no log.
 */
export const DEPENDENCIAS: Partial<Record<Permissao, Permissao[]>> = {
  [PERMISSOES.VENDEDORES_REGISTRAR]: [PERMISSOES.VENDEDORES_VER],
  [PERMISSOES.LOJAS_REGISTRAR]: [PERMISSOES.LOJAS_VER],
};

export function dependenciasFaltantes(concedidas: string[]): string[] {
  const set = new Set(concedidas);
  const faltando: string[] = [];
  for (const [chave, requisitos] of Object.entries(DEPENDENCIAS)) {
    if (!set.has(chave)) continue;
    for (const req of requisitos ?? []) {
      if (!set.has(req)) faltando.push(`${chave} requer ${req}`);
    }
  }
  return faltando;
}

/** Separa o que o hub mandou entre chaves válidas e desconhecidas. */
export function filtrarChaves(recebidas: unknown): { validas: Permissao[]; ignoradas: string[] } {
  if (!Array.isArray(recebidas)) return { validas: [], ignoradas: [] };
  const validas: Permissao[] = [];
  const ignoradas: string[] = [];
  for (const item of recebidas) {
    if (typeof item === 'string' && CHAVES_VALIDAS.has(item)) {
      if (!validas.includes(item as Permissao)) validas.push(item as Permissao);
    } else {
      ignoradas.push(String(item));
    }
  }
  return { validas, ignoradas };
}

/** Módulo ↔ permissões. Usado pelas rotas que servem os dois módulos. */
export const PERMISSOES_DO_MODULO = {
  VENDEDOR: { ver: PERMISSOES.VENDEDORES_VER, registrar: PERMISSOES.VENDEDORES_REGISTRAR },
  LOJA: { ver: PERMISSOES.LOJAS_VER, registrar: PERMISSOES.LOJAS_REGISTRAR },
} as const;
