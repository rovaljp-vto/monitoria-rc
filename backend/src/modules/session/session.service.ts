import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { APP_CONFIG, type AppConfig } from '../../common/config/app-config';
import { gerarTokenSessao, hashTokenSessao } from '../../common/crypto/roval-hmac';

/**
 * Ciclo de vida da sessão.
 *
 * O cookie carrega apenas um token opaco de 32 bytes; o banco guarda o hash.
 * Um dump do banco, portanto, não permite assumir a sessão de ninguém.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Cria a sessão e a grava no cookie.
   *
   * Rotação do identificador de sessão após autenticação:
   * qualquer sessão anterior do mesmo usuário é encerrada antes, então um id
   * capturado antes do login não sobrevive ao login.
   */
  async criar(
    res: Response,
    usuarioId: string,
    contexto: { ip?: string; userAgent?: string },
  ): Promise<void> {
    const agora = new Date();
    const { token, hash } = gerarTokenSessao();

    await this.prisma.$transaction(async (tx) => {
      await tx.sessao.updateMany({
        where: { usuarioId, encerradaEm: null },
        data: { encerradaEm: agora, motivoEncerramento: 'rotacao-sso' },
      });
      await tx.sessao.create({
        data: {
          tokenHash: hash,
          usuarioId,
          criadaEm: agora,
          ultimoUsoEm: agora,
          expiraEm: new Date(
            agora.getTime() + this.config.sessao.maxHours * 3_600_000,
          ),
          ip: contexto.ip ?? null,
          userAgent: contexto.userAgent?.slice(0, 500) ?? null,
        },
      });
      await tx.usuario.update({
        where: { id: usuarioId },
        data: { ultimoAcessoEm: agora },
      });
    });

    res.cookie(this.config.sessao.cookieName, token, {
      httpOnly: true,
      secure: this.config.sessao.secure,
      // Lax permite que o redirect do RovalConnecta (navegação top-level GET)
      // chegue já com o cookie; Strict quebraria a volta do SSO.
      sameSite: 'lax',
      path: '/',
      maxAge: this.config.sessao.maxHours * 3_600_000,
    });
  }

  async encerrar(res: Response, token: string | undefined): Promise<void> {
    if (token) {
      await this.prisma.sessao.updateMany({
        where: { tokenHash: hashTokenSessao(token), encerradaEm: null },
        data: { encerradaEm: new Date(), motivoEncerramento: 'logout' },
      });
    }
    res.clearCookie(this.config.sessao.cookieName, { path: '/' });
  }
}
