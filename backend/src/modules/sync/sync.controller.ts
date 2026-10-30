import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Inject,
  Logger,
  Post,
  Req,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { Publico } from '../../common/decorators';
import { APP_CONFIG, type AppConfig } from '../../common/config/app-config';
import {
  timestampDentroDaJanela,
  verificarAssinaturaBody,
  verificarAssinaturaTimestamp,
} from '../../common/crypto/roval-hmac';
import {
  CATALOGO,
  CATALOG_VERSION,
  PERMISSOES_PADRAO,
} from '../../common/constants/permissions';
import { SyncService } from './sync.service';
import { EventoSyncSchema, EventoVendedorSchema } from './sync.schemas';

/**
 * Endpoints consumidos pelo RovalConnecta.
 *
 * Não usam sessão: a autenticação é o HMAC compartilhado. São públicos para o
 * SessionGuard e fechados pela assinatura.
 */
@Controller('api/sync')
export class SyncController {
  private readonly logger = new Logger(SyncController.name);

  constructor(
    private readonly sync: SyncService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * POST /api/sync/users — recebe user.upsert | user.disable | user.delete.
   *
   * Ordem de validação exigida por GUIA-INTEGRACAO §5.3:
   *   timestamp → assinatura → processamento.
   * Nada do corpo é interpretado antes da assinatura conferir.
   */
  @Publico()
  @Post('users')
  async receberUsuarios(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-roval-signature') assinatura: string,
    @Headers('x-roval-timestamp') timestamp: string,
  ): Promise<{ externalId: string | null }> {
    // 1. Anti-replay (±5 min).
    if (!timestampDentroDaJanela(timestamp)) {
      await this.sync.registrarRejeicao('timestamp expired', null);
      throw new BadRequestException('timestamp expired');
    }

    // 2. HMAC sobre os BYTES CRUS. `rawBody` vem do bootstrap com
    //    `NestFactory.create(..., { rawBody: true })` — se o corpo tivesse sido
    //    reserializado, a assinatura nunca bateria (GUIA-INTEGRACAO §11).
    const bodyCru = req.rawBody;
    if (!bodyCru?.length) {
      throw new BadRequestException('corpo vazio');
    }
    if (
      !verificarAssinaturaBody(this.config.rovalSyncSecret, bodyCru, assinatura)
    ) {
      await this.sync.registrarRejeicao('invalid signature', null);
      throw new UnauthorizedException('invalid signature');
    }

    // 3. Agora o conteúdo pode ser lido.
    let bruto: unknown;
    try {
      bruto = JSON.parse(bodyCru.toString('utf8'));
    } catch {
      throw new BadRequestException('invalid json');
    }

    // Duas trilhas no mesmo endpoint, discriminadas pelo `event`:
    //   `user.*`     → identidade/acesso (tabela `usuarios`)
    //   `vendedor.*` → cadastro de vendedor + lotação (tabela `vendedores`)
    // O hub só manda `vendedor.*` para satélite marcado com `syncVendedores`,
    // então aqui o evento é esperado — e um desconhecido continua dando 400.
    const nomeEvento = (bruto as { event?: unknown } | null)?.event;
    if (nomeEvento === 'vendedor.upsert' || nomeEvento === 'vendedor.disable') {
      const parseVendedor = EventoVendedorSchema.safeParse(bruto);
      if (!parseVendedor.success) {
        const motivo = parseVendedor.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ');
        await this.sync.registrarRejeicao(motivo, bruto);
        throw new BadRequestException(motivo);
      }
      return this.sync.processarVendedor(parseVendedor.data, bruto);
    }

    const parse = EventoSyncSchema.safeParse(bruto);
    if (!parse.success) {
      const motivo = parse.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      await this.sync.registrarRejeicao(motivo, bruto);
      throw new BadRequestException(motivo);
    }

    const { externalId } = await this.sync.processar(parse.data, bruto);
    // GUIA-INTEGRACAO §4 — devolver o id local é opcional, mas é o que alimenta
    // a coluna "Replicação" do painel do hub.
    return { externalId };
  }

  /**
   * GET /api/sync/permissions — publica o catálogo.
   *
   * ⚠️ A assinatura aqui cobre a STRING DO TIMESTAMP, não um corpo:
   * `HMAC_SHA256(secret, "1783440000")` — GUIA-INTEGRACAO §13.1.
   */
  @Publico()
  @Get('permissions')
  async publicarCatalogo(
    @Headers('x-roval-signature') assinatura: string,
    @Headers('x-roval-timestamp') timestamp: string,
  ) {
    if (!timestampDentroDaJanela(timestamp)) {
      throw new BadRequestException('timestamp expired');
    }
    if (
      !verificarAssinaturaTimestamp(
        this.config.rovalSyncSecret,
        timestamp,
        assinatura,
      )
    ) {
      throw new UnauthorizedException('invalid signature');
    }

    return {
      version: CATALOG_VERSION,
      permissions: CATALOGO.map((p) => ({
        key: p.key,
        nome: p.nome,
        descricao: p.descricao,
        categoria: p.categoria,
        ordem: p.ordem,
      })),
      defaults: PERMISSOES_PADRAO,
    };
  }
}
