import { Controller, Get, Inject, Logger, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Publico } from '../../common/decorators';
import { APP_CONFIG, type AppConfig } from '../../common/config/app-config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { validarTokenSso } from '../../common/crypto/roval-hmac';
import { createHash } from 'node:crypto';
import { SessionService } from '../session/session.service';
import { AuditService } from '../audit/audit.service';
import { paginaErroSso } from './sso.page';

/**
 * Login automático vindo do card do RovalConnecta — GUIA-SSO.md.
 *
 * O endereço é derivado pelo hub a partir do syncUrl:
 * `<origin-do-syncUrl>/sso/login`. Por isso esta rota precisa sair da MESMA
 * porta do webhook e do frontend.
 */
@Controller('sso')
export class SsoController {
  private readonly logger = new Logger(SsoController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessao: SessionService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Publico()
  // Mais apertado que o limite global: o SSO é a porta de entrada.
  // Desligado junto com o global quando THROTTLE_LIMIT=0 (suíte de testes).
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('login')
  async login(
    @Query('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (!token) {
      return this.recusar(res, 400, 'Token ausente', 'O endereço veio sem token. Volte ao RovalConnecta e clique no card do Checklist Comercial.');
    }

    // GUIA-SSO.md, validações obrigatórias: assinatura ANTES de confiar no conteúdo,
    // depois payload, iat/exp e moduleId.
    const resultado = validarTokenSso(
      this.config.rovalSyncSecret,
      token,
      this.config.rovalModuleId ?? undefined,
    );

    if (!resultado.ok) {
      const { status, titulo, detalhe } = this.explicar(resultado.motivo);
      await this.audit.registrar({
        acao: 'sso.recusado',
        metadata: { motivo: resultado.motivo },
        ip: req.ip,
      });
      return this.recusar(res, status, titulo, detalhe);
    }

    const { payload } = resultado;

    // Uso único — fecha a pendência registrada em GUIA-SSO.md ("Segurança").
    const tokenHash = createHash('sha256').update(token).digest('hex');
    try {
      await this.prisma.ssoTokenUsado.create({
        data: {
          tokenHash,
          usuarioId: payload.userId,
          expiraEm: new Date(payload.exp * 1000),
        },
      });
    } catch {
      // Violação de chave primária = token já consumido.
      //
      // NENHUMA sessão é criada aqui — é essa a propriedade de segurança, e ela
      // vale igual para um token roubado de log ou histórico.
      //
      // Mas a resposta é um redirect, não uma página de erro: o payload do hub
      // não tem nonce e o `iat` tem granularidade de segundo, então dois cliques
      // no card dentro do mesmo segundo geram tokens IDÊNTICOS. Quem já entrou
      // cai na aplicação com a sessão da primeira vez; quem não tem sessão vê a
      // tela de acesso não liberado. O atacante, em ambos os casos, não ganha
      // sessão nenhuma.
      await this.audit.registrar({
        acao: 'sso.recusado',
        metadata: { motivo: 'token-reutilizado', codigoFuncionario: payload.codigoFuncionario },
        ip: req.ip,
      });
      res.redirect('/');
      return;
    }

    // Localizar o usuário. GUIA-SSO.md: "Não auto-provisione — se não está no
    // banco do seu sistema, a replicação não rodou".
    const usuario = payload.superAdmin
      ? await this.prisma.usuario.findFirst({
          where: { isAdminLocal: true },
          include: { permissoes: { select: { chave: true } } },
        })
      : payload.codigoFuncionario
        ? await this.prisma.usuario.findUnique({
            where: { codigoFuncionario: payload.codigoFuncionario },
            include: { permissoes: { select: { chave: true } } },
          })
        : null;

    if (!usuario) {
      await this.audit.registrar({
        acao: 'sso.recusado',
        metadata: { motivo: 'usuario-inexistente', codigoFuncionario: payload.codigoFuncionario },
        ip: req.ip,
      });
      return this.recusar(
        res,
        404,
        'Usuário não cadastrado neste sistema',
        'A replicação do RovalConnecta ainda não chegou até aqui. Peça ao administrador para reenviar em Usuários → Replicação.',
      );
    }

    // Recusar inexistente, inativo, bloqueado ou excluído.
    if (usuario.estado === 'BLOQUEADO') {
      return this.recusarUsuario(res, req, usuario.id, 'bloqueado', 403, 'Acesso bloqueado', 'Seu acesso foi bloqueado no RovalConnecta. Procure o administrador.');
    }
    if (usuario.estado === 'EXCLUIDO') {
      return this.recusarUsuario(res, req, usuario.id, 'excluido', 403, 'Acesso removido', 'Seu acesso ao Checklist Comercial foi removido no RovalConnecta.');
    }

    // Usuário comum sem nenhuma permissão não inicia sessão (PERMISSOES.md).
    // O superAdmin entra como o admin local, com acesso total.
    if (!usuario.isAdminLocal) {
      if (usuario.permissoes.length === 0 || usuario.estado === 'PENDENTE') {
        return this.recusarUsuario(
          res, req, usuario.id, 'sem-permissoes', 403,
          'Sem permissões neste sistema',
          'Seu cadastro chegou, mas nenhuma permissão do Checklist Comercial foi marcada no RovalConnecta. Peça ao administrador para marcar as permissões em Usuários → Permissões.',
        );
      }
    }

    await this.sessao.criar(res, usuario.id, {
      ip: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });

    await this.audit.registrar({
      acao: 'sso.login',
      atorId: usuario.id,
      atorNome: usuario.nome,
      metadata: {
        superAdmin: payload.superAdmin,
        codigoFuncionario: payload.codigoFuncionario,
      },
      ip: req.ip,
    });

    // Redireciona para a página inicial autorizada.
    res.redirect('/');
  }

  private explicar(motivo: string): { status: number; titulo: string; detalhe: string } {
    switch (motivo) {
      case 'malformado':
        return { status: 400, titulo: 'Token malformado', detalhe: 'O token não tem o formato esperado. Volte ao RovalConnecta e clique no card novamente.' };
      case 'assinatura':
        return {
          status: 401,
          titulo: 'Assinatura inválida',
          detalhe: 'O segredo HMAC do Checklist Comercial não confere com o cadastrado no RovalConnecta. O administrador precisa gerar o segredo no painel e reconfigurar ROVAL_SYNC_SECRET aqui.',
        };
      case 'corrompido':
        return { status: 400, titulo: 'Token corrompido', detalhe: 'O conteúdo do token não pôde ser lido. Tente novamente pelo card do RovalConnecta.' };
      case 'expirado':
        return {
          status: 401,
          titulo: 'Token expirado',
          detalhe: 'O token vale por cerca de 90 segundos. Volte ao RovalConnecta e clique no card outra vez. Se persistir, verifique o relógio (NTP) dos dois servidores.',
        };
      case 'modulo':
        return { status: 401, titulo: 'Token de outro sistema', detalhe: 'Este token foi emitido para outro módulo do RovalConnecta.' };
      default:
        return { status: 401, titulo: 'Acesso recusado', detalhe: 'Não foi possível validar o acesso.' };
    }
  }

  private async recusarUsuario(
    res: Response, req: Request, usuarioId: string, motivo: string,
    status: number, titulo: string, detalhe: string,
  ): Promise<void> {
    await this.audit.registrar({
      acao: 'sso.recusado',
      atorId: usuarioId,
      metadata: { motivo },
      ip: req.ip,
    });
    return this.recusar(res, status, titulo, detalhe);
  }

  /** Quem chega aqui está num navegador — a resposta precisa ser legível. */
  private recusar(res: Response, status: number, titulo: string, detalhe: string): void {
    res.status(status).type('html').send(paginaErroSso(titulo, detalhe));
  }
}
