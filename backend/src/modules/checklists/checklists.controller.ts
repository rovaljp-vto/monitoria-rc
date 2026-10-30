import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RequerPermissao, UsuarioAtual } from '../../common/decorators';
import { PERMISSOES, PERMISSOES_DO_MODULO } from '../../common/constants/permissions';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { exigir, moduloDoSlug } from '../../common/acesso/modulo';
import type { UsuarioAutenticado } from '../../common/guards/session.guard';
import { ChecklistsService, NovaVersaoSchema, type NovaVersao } from './checklists.service';

@Controller('api/checklists')
export class ChecklistsController {
  constructor(private readonly checklists: ChecklistsService) {}

  /** Versão vigente — o formulário de registro e a administração leem daqui. */
  @Get(':modulo')
  vigente(@Param('modulo') slug: string, @UsuarioAtual() u: UsuarioAutenticado) {
    const modulo = moduloDoSlug(slug);
    exigir(u, PERMISSOES_DO_MODULO[modulo].ver, PERMISSOES.CADASTROS_GERENCIAR);
    return this.checklists.vigente(modulo);
  }

  @Get(':modulo/versoes')
  @RequerPermissao(PERMISSOES.CADASTROS_GERENCIAR)
  versoes(@Param('modulo') slug: string) {
    return this.checklists.historico(moduloDoSlug(slug));
  }

  @Post(':modulo/versoes')
  @RequerPermissao(PERMISSOES.CADASTROS_GERENCIAR)
  novaVersao(
    @Param('modulo') slug: string,
    @Body(zodPipe(NovaVersaoSchema)) dto: NovaVersao,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.checklists.novaVersao(moduloDoSlug(slug), dto, u);
  }
}
