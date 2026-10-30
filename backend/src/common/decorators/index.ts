import {
  SetMetadata,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import type { Permissao } from '../constants/permissions';
import type { UsuarioAutenticado } from '../guards/session.guard';

/** Rota sem sessão (webhook, catálogo, SSO, health). */
export const PUBLICO_KEY = 'rota_publica';
export const Publico = () => SetMetadata(PUBLICO_KEY, true);

/**
 * Exige TODAS as permissões listadas.
 *
 * O admin local (onde o superAdmin do hub é vinculado) atravessa qualquer exigência
 * — a checagem está no PermissionsGuard, não espalhada pelos controllers.
 */
export const PERMISSOES_KEY = 'permissoes_exigidas';
export const RequerPermissao = (...permissoes: Permissao[]) =>
  SetMetadata(PERMISSOES_KEY, permissoes);

/** Exige PELO MENOS UMA das permissões listadas. */
export const PERMISSOES_ALGUMA_KEY = 'permissoes_alguma';
export const RequerAlguma = (...permissoes: Permissao[]) =>
  SetMetadata(PERMISSOES_ALGUMA_KEY, permissoes);

export const UsuarioAtual = createParamDecorator(
  (campo: keyof UsuarioAutenticado | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    const usuario: UsuarioAutenticado | undefined = req.usuario;
    return campo ? usuario?.[campo] : usuario;
  },
);
