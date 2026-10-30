import { Injectable, Logger, Module } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Limpeza periódica do que só existe por segurança e perde o sentido depois de
 * expirar: tokens SSO já consumidos e sessões encerradas há mais de 90 dias.
 * Monitorias, observações e auditoria NUNCA passam por aqui.
 */
@Injectable()
class LimpezaService {
  private readonly logger = new Logger('Limpeza');

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: 'America/Sao_Paulo' })
  async limpar(): Promise<void> {
    const agora = new Date();
    const tokens = await this.prisma.ssoTokenUsado.deleteMany({ where: { expiraEm: { lt: agora } } });
    const sessoes = await this.prisma.sessao.deleteMany({
      where: { encerradaEm: { lt: new Date(agora.getTime() - 90 * 86_400_000) } },
    });
    this.logger.log(`Tokens SSO removidos: ${tokens.count}; sessões antigas: ${sessoes.count}`);
  }
}

@Module({ providers: [LimpezaService] })
export class ManutencaoModule {}
