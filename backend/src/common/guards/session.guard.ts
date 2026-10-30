import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLICO_KEY } from '../decorators';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { hashTokenSessao } from '../crypto/roval-hmac';
import type { Permissao } from '../constants/permissions';

export interface UsuarioAutenticado {
  id: string;
  nome: string;
  username: string;
  codigoFuncionario: string | null;
  filial: string | null;
  setor: string | null;
  /** Admin local (superAdmin do hub vinculado): acesso total, não depende do catálogo. */
  isAdminLocal: boolean;
  permissoes: Set<Permissao>;
  sessaoId: string;
}

declare module 'express' {
  interface Request {
    usuario?: UsuarioAutenticado;
    requestId?: string;
  }
}

/**
 * Autenticação por cookie de sessão.
 *
 * A decisão de projeto mais importante daqui: as permissões são LIDAS DO BANCO
 * a cada requisição, nunca do cookie nem de um cache de sessão.
 *
 *   GUIA-INTEGRACAO §13.2 — o hub é a fonte da verdade das permissões; o
 *   conjunto local é substituído a cada upsert, então é ele que vale — não
 *   o que estava valendo quando a sessão foi criada.
 *   PERMISSOES.md — "Revogação vale na hora. (...) tirar um grant no hub tem
 *   efeito imediato — não espera o token expirar."
 *
 * Custo: uma query indexada por requisição. Em troca, desmarcar a permissão no
 * RovalConnecta fecha a porta no próximo clique, e não em algumas horas.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const publico = this.reflector.getAllAndOverride<boolean>(PUBLICO_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (publico) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token = req.cookies?.[this.config.sessao.cookieName];
    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException('Sessão ausente. Entre pelo RovalConnecta.');
    }

    const sessao = await this.prisma.sessao.findUnique({
      where: { tokenHash: hashTokenSessao(token) },
      include: {
        usuario: { include: { permissoes: { select: { chave: true } } } },
      },
    });

    if (!sessao || sessao.encerradaEm) {
      throw new UnauthorizedException('Sessão encerrada. Entre novamente.');
    }

    const agora = new Date();

    // Duração máxima absoluta.
    if (sessao.expiraEm <= agora) {
      await this.encerrar(sessao.id, 'expirada');
      throw new UnauthorizedException('Sessão expirada. Entre novamente.');
    }

    // Expiração por inatividade.
    const limiteInatividade = new Date(
      sessao.ultimoUsoEm.getTime() + this.config.sessao.idleMinutes * 60_000,
    );
    if (limiteInatividade <= agora) {
      await this.encerrar(sessao.id, 'inatividade');
      throw new UnauthorizedException('Sessão expirada por inatividade.');
    }

    // Usuário bloqueado no hub perde acesso imediatamente (GUIA-INTEGRACAO §6.4).
    const usuario = sessao.usuario;
    if (usuario.estado !== 'ATIVO') {
      await this.encerrar(sessao.id, `estado:${usuario.estado}`);
      throw new UnauthorizedException(
        usuario.estado === 'BLOQUEADO'
          ? 'Seu acesso foi bloqueado no RovalConnecta.'
          : 'Seu acesso a este sistema foi removido.',
      );
    }

    const permissoes = new Set(
      usuario.permissoes.map((p) => p.chave),
    ) as Set<Permissao>;

    // Usuário comum sem nenhuma permissão não inicia sessão operacional
    // (PERMISSOES.md). Vale também para manter a sessão viva: se o
    // último grant foi removido, a sessão cai agora.
    if (!usuario.isAdminLocal && permissoes.size === 0) {
      await this.encerrar(sessao.id, 'sem-permissoes');
      throw new UnauthorizedException(
        'Você não possui permissões neste sistema. Procure o administrador do RovalConnecta.',
      );
    }

    // Sliding window de inatividade + último acesso. Gravação a cada minuto,
    // no máximo, para não transformar leitura em escrita a cada request.
    if (agora.getTime() - sessao.ultimoUsoEm.getTime() > 60_000) {
      await this.prisma.sessao.update({
        where: { id: sessao.id },
        data: { ultimoUsoEm: agora, usuario: { update: { ultimoAcessoEm: agora } } },
      });
    }

    req.usuario = {
      id: usuario.id,
      nome: usuario.nome,
      username: usuario.username,
      codigoFuncionario: usuario.codigoFuncionario,
      filial: usuario.filial,
      setor: usuario.setor,
      isAdminLocal: usuario.isAdminLocal,
      permissoes,
      sessaoId: sessao.id,
    };
    return true;
  }

  private async encerrar(sessaoId: string, motivo: string): Promise<void> {
    await this.prisma.sessao.update({
      where: { id: sessaoId },
      data: { encerradaEm: new Date(), motivoEncerramento: motivo },
    });
  }
}
