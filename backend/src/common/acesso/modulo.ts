import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TipoModulo } from '@prisma/client';
import { CATALOGO, PERMISSOES_DO_MODULO, type Permissao } from '../constants/permissions';
import type { UsuarioAutenticado } from '../guards/session.guard';

/**
 * Rotas que servem os dois módulos recebem o módulo na URL. A permissão exigida
 * depende dele, então não dá para declará-la em decorator — a checagem mora
 * aqui, num lugar só, com o mesmo bypass do admin local que o PermissionsGuard.
 */

const POR_SLUG: Record<string, TipoModulo> = {
  vendedores: TipoModulo.VENDEDOR,
  lojas: TipoModulo.LOJA,
};

export function moduloDoSlug(slug: string): TipoModulo {
  const modulo = POR_SLUG[slug];
  if (!modulo) throw new BadRequestException('Módulo desconhecido: use "vendedores" ou "lojas".');
  return modulo;
}

const NOME = new Map(CATALOGO.map((p) => [p.key, p.nome]));

export function tem(usuario: UsuarioAutenticado, chave: Permissao): boolean {
  return usuario.isAdminLocal || usuario.permissoes.has(chave);
}

export function exigir(usuario: UsuarioAutenticado, ...alguma: Permissao[]): void {
  if (alguma.some((c) => tem(usuario, c))) return;
  const lista = alguma.map((c) => NOME.get(c) ?? c).join(' ou ');
  throw new ForbiddenException(
    `Esta ação exige a permissão: ${lista}. Solicite ao administrador no RovalConnecta.`,
  );
}

export function exigirVer(usuario: UsuarioAutenticado, modulo: TipoModulo): void {
  exigir(usuario, PERMISSOES_DO_MODULO[modulo].ver);
}

export function exigirRegistrar(usuario: UsuarioAutenticado, modulo: TipoModulo): void {
  exigir(usuario, PERMISSOES_DO_MODULO[modulo].registrar);
}

export function podeRegistrar(usuario: UsuarioAutenticado, modulo: TipoModulo): boolean {
  return tem(usuario, PERMISSOES_DO_MODULO[modulo].registrar);
}
