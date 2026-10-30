import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../common/prisma/prisma.service';
import { APP_CONFIG, type AppConfig } from '../../common/config/app-config';
import { dataPura, diaAnterior, isoDaDataPura } from '../../common/tempo/mes';
import type { UsuarioAutenticado } from '../../common/guards/session.guard';
import { AuditService } from '../audit/audit.service';

export const TransferirSchema = z
  .object({
    lojaId: z.string().uuid(),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD.'),
    motivo: z.string().trim().max(300).optional(),
  })
  .strict();
export type Transferir = z.infer<typeof TransferirSchema>;

type Tx = Prisma.TransactionClient | PrismaService;

/**
 * Lotação vendedor↔loja no tempo — mesma regra do FAC (vendedor_filial_periodo).
 *
 * Transferir fecha o período aberto no dia anterior à data da transferência e
 * abre um novo na loja de destino. Assim cada mês continua mostrando o
 * vendedor na loja em que ele estava NAQUELE mês: cobertura, "x/6 avaliados"
 * e as notas por loja não mudam para trás.
 *
 * A loja de cada monitoria é realinhada ao histórico sempre que ele muda
 * (transferência retroativa ou desfeita): a monitoria conta na loja em que o
 * vendedor estava no dia do atendimento.
 */
@Injectable()
export class LotacaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Loja do vendedor num dia ("AAAA-MM-DD"), ou null se não havia lotação. */
  async lojaNaData(vendedorId: string, dia: string, tx: Tx = this.prisma): Promise<string | null> {
    const p = await tx.vendedorLojaPeriodo.findFirst({
      where: {
        vendedorId,
        dataInicio: { lte: dataPura(dia) },
        OR: [{ dataFim: null }, { dataFim: { gte: dataPura(dia) } }],
      },
      orderBy: { dataInicio: 'desc' },
      select: { lojaId: true },
    });
    return p?.lojaId ?? null;
  }

  async listar(vendedorId: string) {
    const periodos = await this.prisma.vendedorLojaPeriodo.findMany({
      where: { vendedorId },
      orderBy: { dataInicio: 'desc' },
      select: { id: true, dataInicio: true, dataFim: true, motivo: true, loja: { select: { id: true, nome: true } } },
    });
    const primeiroId = periodos[periodos.length - 1]?.id;
    return periodos.map((p) => ({
      id: p.id,
      loja: p.loja,
      dataInicio: isoDaDataPura(p.dataInicio),
      dataFim: p.dataFim ? isoDaDataPura(p.dataFim) : null,
      motivo: p.motivo,
      // A primeira lotação é a âncora do histórico: só se corrige, não se exclui (regra do FAC).
      removivel: p.id !== primeiroId,
    }));
  }

  /** Lotação inicial de um vendedor novo. */
  abrirInicial(tx: Tx, vendedorId: string, lojaId: string, dia: string) {
    return tx.vendedorLojaPeriodo.create({ data: { vendedorId, lojaId, dataInicio: dataPura(dia) } });
  }

  /**
   * Vendedor replicado do RovalConnecta tem a lotação definida lá: o hub manda
   * a timeline inteira a cada webhook (REPLACE), então qualquer transferência
   * registrada aqui seria desfeita na próxima replicação — silenciosamente, o
   * que é pior do que recusar.
   */
  private assertLotacaoLocal(
    vendedor: { nome: string; rovalManaged: boolean },
    operacao: string,
  ): void {
    if (!vendedor.rovalManaged) return;
    throw new BadRequestException(
      `${operacao} de ${vendedor.nome} é feita no RovalConnecta, em Administração → Usuários → `
      + 'Transferir de filial. O histórico chega aqui automaticamente.',
    );
  }

  async transferir(vendedorId: string, dto: Transferir, ator: UsuarioAutenticado) {
    const vendedor = await this.prisma.vendedor.findUnique({ where: { id: vendedorId }, select: { id: true, nome: true, ativo: true, rovalManaged: true } });
    if (!vendedor) throw new NotFoundException('Vendedor(a) não encontrado(a).');
    this.assertLotacaoLocal(vendedor, 'A transferência');
    if (!vendedor.ativo) throw new BadRequestException(`${vendedor.nome} está inativo(a). Reative antes de transferir.`);
    const destino = await this.prisma.loja.findUnique({ where: { id: dto.lojaId } });
    if (!destino) throw new BadRequestException('Loja não encontrada.');
    if (!destino.ativa) throw new BadRequestException(`A loja ${destino.nome} está inativa.`);

    const resultado = await this.prisma.$transaction(async (tx) => {
      const aberto = await tx.vendedorLojaPeriodo.findFirst({
        where: { vendedorId, dataFim: null },
        include: { loja: { select: { nome: true } } },
      });
      if (aberto) {
        const inicio = isoDaDataPura(aberto.dataInicio);
        if (aberto.lojaId === dto.lojaId) throw new BadRequestException(`${vendedor.nome} já está na loja ${destino.nome}.`);
        if (dto.data <= inicio) {
          throw new BadRequestException(
            `A data da transferência precisa ser depois de ${inicio.split('-').reverse().join('/')}, quando começou a lotação atual em ${aberto.loja.nome}. Para corrigir essa lotação, exclua a transferência que a criou.`,
          );
        }
        await tx.vendedorLojaPeriodo.update({ where: { id: aberto.id }, data: { dataFim: dataPura(diaAnterior(dto.data)) } });
      }
      await tx.vendedorLojaPeriodo.create({
        data: { vendedorId, lojaId: dto.lojaId, dataInicio: dataPura(dto.data), motivo: dto.motivo || null },
      });
      // Espelho da lotação atual (listas, formulário de nova monitoria).
      await tx.vendedor.update({ where: { id: vendedorId }, data: { lojaId: dto.lojaId } });
      const realinhadas = await this.realinharMonitorias(tx, vendedorId);
      return { origem: aberto?.loja.nome ?? null, realinhadas };
    });

    await this.audit.registrar({
      acao: 'vendedor.transferir',
      atorId: ator.id,
      atorNome: ator.nome,
      alvo: vendedorId,
      metadata: { de: resultado.origem, para: destino.nome, data: dto.data, motivo: dto.motivo ?? null, monitoriasRealinhadas: resultado.realinhadas },
    });
    return { ok: true, monitoriasRealinhadas: resultado.realinhadas };
  }

  /**
   * Desfaz uma transferência (exclui o período). Se era a lotação atual, a
   * anterior é reaberta — como no FAC. A primeira lotação não se exclui.
   */
  async remover(periodoId: string, ator: UsuarioAutenticado) {
    const periodo = await this.prisma.vendedorLojaPeriodo.findUnique({
      where: { id: periodoId },
      include: { loja: { select: { nome: true } }, vendedor: { select: { nome: true, rovalManaged: true } } },
    });
    if (!periodo) throw new NotFoundException('Lotação não encontrada.');
    this.assertLotacaoLocal(periodo.vendedor, 'A correção do histórico de lotação');

    const realinhadas = await this.prisma.$transaction(async (tx) => {
      const primeiro = await tx.vendedorLojaPeriodo.findFirst({ where: { vendedorId: periodo.vendedorId }, orderBy: { dataInicio: 'asc' }, select: { id: true } });
      if (primeiro?.id === periodo.id) {
        throw new BadRequestException('A primeira lotação do vendedor não pode ser excluída — ela é o início do histórico.');
      }
      await tx.vendedorLojaPeriodo.delete({ where: { id: periodo.id } });
      if (periodo.dataFim === null) {
        const anterior = await tx.vendedorLojaPeriodo.findFirst({
          where: { vendedorId: periodo.vendedorId },
          orderBy: { dataInicio: 'desc' },
        });
        if (anterior) {
          await tx.vendedorLojaPeriodo.update({ where: { id: anterior.id }, data: { dataFim: null } });
          await tx.vendedor.update({ where: { id: periodo.vendedorId }, data: { lojaId: anterior.lojaId } });
        }
      }
      return this.realinharMonitorias(tx, periodo.vendedorId);
    });

    await this.audit.registrar({
      acao: 'vendedor.transferencia.remover',
      atorId: ator.id,
      atorNome: ator.nome,
      alvo: periodo.vendedorId,
      metadata: { loja: periodo.loja.nome, dataInicio: isoDaDataPura(periodo.dataInicio), monitoriasRealinhadas: realinhadas },
    });
    return { ok: true, monitoriasRealinhadas: realinhadas };
  }

  /**
   * Mesmo realinhamento, para quem recebe o histórico já pronto de fora — a
   * replicação do RovalConnecta (`vendedor.upsert`), que substitui a timeline
   * inteira e precisa reancorar as monitorias depois.
   */
  realinharMonitoriasPublico(tx: Tx, vendedorId: string): Promise<number> {
    return this.realinharMonitorias(tx, vendedorId);
  }

  /**
   * Cada monitoria do vendedor passa a contar na loja em que ele estava no dia
   * do atendimento (dia local). Nota, faixa e versão não são tocadas — a
   * trava do banco continua valendo para elas.
   */
  private async realinharMonitorias(tx: Tx, vendedorId: string): Promise<number> {
    return tx.$executeRaw`
      UPDATE monitorias m
         SET loja_id = p.loja_id
        FROM vendedor_loja_periodos p
       WHERE m.vendedor_id = ${vendedorId}
         AND p.vendedor_id = m.vendedor_id
         AND (m.data_referencia AT TIME ZONE 'UTC' AT TIME ZONE ${this.config.timezone})::date >= p.data_inicio
         AND (p.data_fim IS NULL OR (m.data_referencia AT TIME ZONE 'UTC' AT TIME ZONE ${this.config.timezone})::date <= p.data_fim)
         AND m.loja_id <> p.loja_id`;
  }
}
