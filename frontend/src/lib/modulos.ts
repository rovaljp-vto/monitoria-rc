import type { Canal, Faixa, Slug, TipoModulo } from './tipos';
import { PERM } from './tipos';

/** Tudo que difere entre os dois módulos, num lugar só. */
export interface ConfigModulo {
  slug: Slug;
  tipo: TipoModulo;
  titulo: string;
  curto: string;
  /** "vendedor" / "loja" — para frases como "3 vendedores pendentes". */
  alvo: string;
  alvos: string;
  perm: { ver: string; registrar: string };
}

export const MODULOS: Record<Slug, ConfigModulo> = {
  vendedores: {
    slug: 'vendedores',
    tipo: 'VENDEDOR',
    titulo: 'Monitoria de Vendedores',
    curto: 'Vendedores',
    alvo: 'vendedor(a)',
    alvos: 'vendedores',
    perm: { ver: PERM.VENDEDORES_VER, registrar: PERM.VENDEDORES_REGISTRAR },
  },
  lojas: {
    slug: 'lojas',
    tipo: 'LOJA',
    titulo: 'Monitoria de Lojas',
    curto: 'Lojas',
    alvo: 'loja',
    alvos: 'lojas',
    perm: { ver: PERM.LOJAS_VER, registrar: PERM.LOJAS_REGISTRAR },
  },
};

export function moduloDoSlug(slug: string | undefined): ConfigModulo | null {
  return slug === 'vendedores' || slug === 'lojas' ? MODULOS[slug] : null;
}

export function slugDoTipo(tipo: TipoModulo): Slug {
  return tipo === 'VENDEDOR' ? 'vendedores' : 'lojas';
}

// Classes literais: o Tailwind só gera o que encontra escrito no código.
export const FAIXAS: Record<Faixa, { rotulo: string; acao: string; cor: string; fundo: string; barra: string }> = {
  EXCELENTE: { rotulo: 'Excelente', acao: 'Reconhecimento', cor: 'text-excelente', fundo: 'bg-excelente-bg', barra: 'bg-excelente' },
  BOM: { rotulo: 'Bom', acao: 'Acompanhamento normal', cor: 'text-bom', fundo: 'bg-bom-bg', barra: 'bg-bom' },
  REGULAR: { rotulo: 'Regular', acao: 'Nova monitoria no mesmo mês', cor: 'text-regular', fundo: 'bg-regular-bg', barra: 'bg-regular' },
  CRITICO: { rotulo: 'Crítico', acao: 'Plano de ação e monitorias extras', cor: 'text-critico', fundo: 'bg-critico-bg', barra: 'bg-critico' },
};

export const ORDEM_FAIXAS: Faixa[] = ['EXCELENTE', 'BOM', 'REGULAR', 'CRITICO'];

export const CANAIS: Record<Canal, string> = { BALCAO: 'Balcão', WHATSAPP: 'WhatsApp' };
