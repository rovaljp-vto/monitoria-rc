import { Controller, Get, Inject, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Publico, UsuarioAtual } from '../../common/decorators';
import type { UsuarioAutenticado } from '../../common/guards/session.guard';
import { APP_CONFIG, type AppConfig } from '../../common/config/app-config';
import { CATALOGO } from '../../common/constants/permissions';
import { SessionService } from './session.service';

@Controller('api')
export class SessionController {
  constructor(
    private readonly sessao: SessionService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * O que a tela sem sessão precisa saber — e nada além disso: para onde manda
   * o botão e se a porta de demonstração existe.
   */
  @Publico()
  @Get('publico/config')
  configPublica() {
    return {
      rovalConnectaUrl: this.config.rovalConnectaUrl,
      demo: this.config.demoLogin,
    };
  }

  /**
   * Usuário e permissões ATUAIS: o SessionGuard releu do banco nesta requisição,
   * então a resposta já reflete uma revogação feita no hub segundos atrás.
   */
  @Get('me')
  eu(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return {
      id: usuario.id,
      nome: usuario.nome,
      username: usuario.username,
      filial: usuario.filial,
      setor: usuario.setor,
      adminLocal: usuario.isAdminLocal,
      permissoes: [...usuario.permissoes],
      /** A tela de permissões é somente leitura: quem concede é o hub. */
      catalogo: CATALOGO,
      timezone: this.config.timezone,
      rovalConnectaUrl: this.config.rovalConnectaUrl,
    };
  }

  @Post('logout')
  async sair(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.sessao.encerrar(res, req.cookies?.[this.config.sessao.cookieName]);
    return { ok: true };
  }
}
