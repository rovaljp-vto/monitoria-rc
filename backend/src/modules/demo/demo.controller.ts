import {
  Controller,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Post,
  Body,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createHmac, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Publico } from '../../common/decorators';
import { APP_CONFIG, type AppConfig } from '../../common/config/app-config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { PERMISSOES } from '../../common/constants/permissions';

const EntrarSchema = z
  .object({ usuarioId: z.string().uuid() })
  .strict();

/** Nome do perfil do escopo (§2) que corresponde ao conjunto de permissões. */
function papelPorPermissoes(chaves: Set<string>): string {
  if (chaves.has(PERMISSOES.VENDEDORES_REGISTRAR)) return 'Monitor(a) de Vendedores';
  if (chaves.has(PERMISSOES.LOJAS_REGISTRAR)) return 'Monitor(a) de Lojas';
  if (chaves.has(PERMISSOES.CADASTROS_GERENCIAR)) return 'Administrador(a)';
  if (chaves.has(PERMISSOES.VENDEDORES_VER) || chaves.has(PERMISSOES.LOJAS_VER)) return 'Gestão';
  return 'Sem permissões';
}

/**
 * Porta de DEMONSTRAÇÃO — nunca existe em produção.
 *
 * A Monitoria de Qualidade não tem login próprio: o RovalConnecta é a fonte
 * única de identidade (GUIA-INTEGRACAO §1), e criar credencial local aqui
 * abriria uma porta paralela a toda a governança de permissões.
 *
 * Este módulo não cria credencial nenhuma. Ele faz o papel que o hub faria em
 * produção: assina um token SSO com o mesmo segredo e devolve a URL de
 * `/sso/login`. O fluxo exercitado é o REAL — validação de assinatura,
 * expiração, módulo, uso único, estado do usuário, permissões e criação de
 * sessão. Nada é contornado; apenas o emissor do token é local.
 *
 * Só responde quando DUAS condições valem:
 *   NODE_ENV !== 'production'  E  DEMO_LOGIN=true
 *
 * Fora disso todo endpoint devolve 404 — o módulo não anuncia a própria
 * existência para quem sonda a aplicação.
 */
@Controller('api/demo')
export class DemoController {
  private readonly logger = new Logger(DemoController.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    if (this.config.demoLogin) {
      this.logger.warn(
        'PORTA DE DEMONSTRAÇÃO ATIVA em /entrar — desative com DEMO_LOGIN=false antes de ir para produção.',
      );
    }
  }

  private exigirDemo(): void {
    if (!this.config.demoLogin) throw new NotFoundException();
  }

  /** O frontend consulta para saber se mostra a porta de demonstração. */
  @Publico()
  @Get('status')
  status() {
    return { habilitado: this.config.demoLogin };
  }

  /**
   * Lista quem existe no banco, com o papel deduzido das permissões reais —
   * não de um cadastro de mentira à parte.
   */
  @Publico()
  @Get('usuarios')
  async usuarios() {
    this.exigirDemo();

    const usuarios = await this.prisma.usuario.findMany({
      where: { estado: { in: ['ATIVO', 'PENDENTE', 'BLOQUEADO'] } },
      select: {
        id: true,
        nome: true,
        codigoFuncionario: true,
        cargo: true,
        setor: true,
        filial: true,
        estado: true,
        isAdminLocal: true,
        permissoes: { select: { chave: true } },
      },
      orderBy: [{ isAdminLocal: 'desc' }, { nome: 'asc' }],
    });

    return usuarios.map((u) => {
      const chaves = new Set(u.permissoes.map((p) => p.chave));

      return {
        id: u.id,
        nome: u.nome,
        codigoFuncionario: u.codigoFuncionario,
        cargo: u.cargo,
        lotacao: [u.setor, u.filial].filter(Boolean).join(' · '),
        estado: u.estado,
        papel: u.isAdminLocal ? 'Administrador local' : papelPorPermissoes(chaves),
        qtdPermissoes: u.permissoes.length,
      };
    });
  }

  /**
   * Assina um token para o usuário escolhido e devolve a URL do SSO.
   *
   * O TTL é o mesmo do hub (90s): esticar aqui esconderia justamente o tipo de
   * falha que se quer enxergar ao testar o fluxo.
   */
  @Publico()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('entrar')
  async entrar(@Body(zodPipe(EntrarSchema)) dto: { usuarioId: string }) {
    this.exigirDemo();

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: dto.usuarioId },
      select: {
        id: true,
        nome: true,
        username: true,
        codigoFuncionario: true,
        isAdminLocal: true,
      },
    });
    if (!usuario) throw new NotFoundException('Usuário não encontrado.');

    const agora = Math.floor(Date.now() / 1000);
    const payload = {
      // Em produção viria o id do usuário no hub; aqui é opaco de qualquer forma.
      userId: randomUUID(),
      username: usuario.username,
      // O admin local é alcançado pelo flag, como o superAdmin do hub.
      codigoFuncionario: usuario.isAdminLocal ? null : usuario.codigoFuncionario,
      nome: usuario.nome,
      superAdmin: usuario.isAdminLocal,
      iat: agora,
      exp: agora + 90,
      moduleId: this.config.rovalModuleId ?? '',
    };

    const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const assinatura = createHmac('sha256', this.config.rovalSyncSecret)
      .update(b64)
      .digest('hex');

    return { url: `/sso/login?token=${b64}.${assinatura}` };
  }
}
