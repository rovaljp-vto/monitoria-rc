import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface EntradaAuditoria {
  acao: string;
  atorId?: string | null;
  atorNome?: string | null;
  alvo?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

/**
 * Trilha de auditoria de ações administrativas e de integração.
 *
 * A tabela é append-only por trigger (migration): nem a aplicação nem um
 * acesso direto ao banco conseguem reescrever o passado.
 *
 * Auditar nunca derruba a operação auditada: uma falha aqui vira log de erro,
 * não exceção — perder o registro é ruim, mas abortar a ação do usuário porque
 * o log falhou é pior.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async registrar(entrada: EntradaAuditoria): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          acao: entrada.acao,
          atorId: entrada.atorId ?? null,
          atorNome: entrada.atorNome ?? null,
          alvo: entrada.alvo ?? null,
          // Ida e volta por JSON: Date e Decimal viram texto, que o campo Json aceita.
          metadata: JSON.parse(JSON.stringify(entrada.metadata ?? {})),
          ip: entrada.ip ?? null,
        },
      });
    } catch (erro) {
      this.logger.error(
        `Falha ao gravar auditoria "${entrada.acao}": ${(erro as Error).message}`,
      );
    }
  }
}
