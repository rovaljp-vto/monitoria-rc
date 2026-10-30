import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LotacaoService } from '../cadastros/lotacao.service';
import { dataPura, isoDaDataPura } from '../../common/tempo/mes';
import type { VendedorRoval } from './sync.schemas';

/**
 * Aplicação dos eventos `vendedor.upsert` / `vendedor.disable` do
 * RovalConnecta — trilha do CADASTRO DE VENDEDOR, separada da de identidade.
 *
 * Por que separada: vendedor é quem é MONITORADO aqui, não quem faz login.
 * Nenhum vendedor tem o card do Checklist no hub, então o `user.upsert`
 * (que respeita `user.systems`) nunca chegaria para eles. Nada neste serviço
 * toca a tabela `usuarios` — só `vendedores` e `vendedor_loja_periodos`.
 *
 * Com isto, todo vendedor cadastrado no RovalConnecta aparece aqui pronto
 * para monitoria, com o histórico de lotação que o hub tem.
 *
 * Tudo é IDEMPOTENTE: o hub reenvia até 3 vezes com backoff e a reconciliação
 * reenvia a base inteira. `lotacoes` vem completo e substitui o histórico
 * local (semântica REPLACE), então reprocessar chega ao mesmo estado.
 */
@Injectable()
export class VendedorSyncService {
  private readonly logger = new Logger(VendedorSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly lotacao: LotacaoService,
  ) {}

  async processar(
    evento: 'vendedor.upsert' | 'vendedor.disable',
    v: VendedorRoval,
  ): Promise<{ externalId: string | null }> {
    if (!v.codigoFuncionario) {
      throw new Error(
        'codigoFuncionario ausente no payload de vendedor — é a chave estável de associação (GUIA-INTEGRACAO §2).',
      );
    }
    return evento === 'vendedor.upsert' ? this.upsert(v) : this.baixar(v);
  }

  /**
   * Baixa do vendedor: inativa e PRESERVA cadastro, histórico e monitorias.
   *
   * Mesma política de `user.delete` (escopo, regras 5 e 7): o evento também
   * chega quando a pessoa apenas mudou de cargo no hub, e monitorias
   * registradas guardam autor, nota e observações — não podem ser apagadas.
   * Um `vendedor.upsert` posterior reativa.
   */
  private async baixar(v: VendedorRoval): Promise<{ externalId: string | null }> {
    const alvo = await this.prisma.vendedor.findUnique({
      where: { codigoFuncionario: v.codigoFuncionario! },
      select: { id: true, nome: true, ativo: true },
    });
    if (!alvo) return { externalId: null }; // idempotente
    if (!alvo.ativo) return { externalId: alvo.id };

    await this.prisma.vendedor.update({
      where: { id: alvo.id },
      data: { ativo: false, inativadoEm: new Date() },
    });
    await this.audit.registrar({
      acao: 'sync.vendedor.baixa',
      alvo: alvo.id,
      metadata: {
        codigoFuncionario: v.codigoFuncionario,
        politica: 'inativar-preservar-monitorias',
      },
    });
    return { externalId: alvo.id };
  }

  private async upsert(v: VendedorRoval): Promise<{ externalId: string | null }> {
    // A lotação aberta define a loja atual; sem histórico, cai no campo do
    // payload. `Vendedor.lojaId` é obrigatório, então sem nenhuma das duas o
    // cadastro não pode ser criado — erro 5xx de propósito, para o hub
    // reenviar e o operador ver a falha no painel de integração.
    const aberta = v.lotacoes.find((l) => l.dataFim === null) ?? null;
    const nomeLojaAtual = aberta?.filial ?? v.filial;
    if (!nomeLojaAtual) {
      throw new Error(
        `Vendedor ${v.codigoFuncionario} chegou sem filial e sem histórico de lotação — `
        + 'defina a filial no cadastro do RovalConnecta.',
      );
    }

    const externalId = await this.prisma.$transaction(async (tx) => {
      const lojaAtualId = await this.resolverLojaId(tx, nomeLojaAtual);

      const existente = await tx.vendedor.findUnique({
        where: { codigoFuncionario: v.codigoFuncionario! },
        select: { id: true, nome: true, ativo: true },
      });

      let vendedorId: string;
      if (existente) {
        await tx.vendedor.update({
          where: { id: existente.id },
          data: {
            nome: v.nome,
            lojaId: lojaAtualId,
            ativo: v.ativo,
            // Reativação limpa a data de inativação, senão a regra 6 seguiria
            // tirando a pessoa da cobertura do mês.
            inativadoEm: v.ativo ? null : undefined,
            rovalUserId: v.id,
            rovalManaged: true,
          },
        });
        vendedorId = existente.id;
      } else {
        const criado = await tx.vendedor.create({
          data: {
            nome: v.nome,
            lojaId: lojaAtualId,
            ativo: v.ativo,
            codigoFuncionario: v.codigoFuncionario,
            rovalUserId: v.id,
            rovalManaged: true,
          },
          select: { id: true },
        });
        vendedorId = criado.id;
        await this.audit.registrar({
          acao: 'sync.vendedor.criado',
          alvo: vendedorId,
          metadata: { codigoFuncionario: v.codigoFuncionario, nome: v.nome, loja: nomeLojaAtual },
        });
      }

      await this.reconciliarLotacoes(tx, vendedorId, v);
      return vendedorId;
    });

    // Fora da transação: realinhar monitorias é um UPDATE em massa que pode
    // tocar muitas linhas, e o histórico já está consistente neste ponto.
    const realinhadas = await this.lotacao.realinharMonitoriasPublico(
      this.prisma,
      externalId,
    );
    if (realinhadas > 0) {
      this.logger.log(
        `Vendedor ${v.codigoFuncionario}: ${realinhadas} monitoria(s) realinhada(s) à loja do histórico.`,
      );
    }
    return { externalId };
  }

  /**
   * Substitui o histórico local pelo que veio no payload (REPLACE), pulando a
   * reescrita quando nada mudou — o caso comum, já que o hub replica o
   * vendedor a cada edição de cadastro.
   *
   * Reescreve em bloco em vez de casar linha por linha: o contrato manda a
   * timeline completa e não tem id estável para os períodos.
   */
  private async reconciliarLotacoes(
    tx: Prisma.TransactionClient,
    vendedorId: string,
    v: VendedorRoval,
  ): Promise<void> {
    const desejado: { lojaId: string; dataInicio: string; dataFim: string | null; motivo: string | null }[] = [];
    for (const l of v.lotacoes) {
      desejado.push({
        lojaId: await this.resolverLojaId(tx, l.filial),
        dataInicio: l.dataInicio,
        dataFim: l.dataFim,
        motivo: l.motivo,
      });
    }

    const atuais = await tx.vendedorLojaPeriodo.findMany({
      where: { vendedorId },
      select: { lojaId: true, dataInicio: true, dataFim: true, motivo: true },
    });
    const chaveLocal = atuais
      .map((p) => `${p.lojaId}|${isoDaDataPura(p.dataInicio)}|${p.dataFim ? isoDaDataPura(p.dataFim) : ''}|${p.motivo ?? ''}`)
      .sort();
    const chaveRemota = desejado
      .map((p) => `${p.lojaId}|${p.dataInicio}|${p.dataFim ?? ''}|${p.motivo ?? ''}`)
      .sort();
    if (
      chaveLocal.length === chaveRemota.length
      && chaveLocal.every((k, i) => k === chaveRemota[i])
    ) {
      return;
    }

    await tx.vendedorLojaPeriodo.deleteMany({ where: { vendedorId } });
    if (desejado.length > 0) {
      await tx.vendedorLojaPeriodo.createMany({
        data: desejado.map((p) => ({
          vendedorId,
          lojaId: p.lojaId,
          dataInicio: dataPura(p.dataInicio),
          dataFim: p.dataFim ? dataPura(p.dataFim) : null,
          motivo: p.motivo,
        })),
      });
    }
    await this.audit.registrar({
      acao: 'sync.vendedor.lotacoes',
      alvo: vendedorId,
      metadata: {
        codigoFuncionario: v.codigoFuncionario,
        periodos: desejado.length,
        antes: chaveLocal,
        depois: chaveRemota,
      },
    });
  }

  /**
   * Resolve a loja pelo nome da filial do hub, tolerando acento e caixa.
   *
   * Loja nova é criada aqui: os nomes são canônicos dos dois lados (Matriz,
   * Mag, Epitácio, B2C, Altiplano — a migration renomeou as antigas), e
   * recusar o webhook por causa de uma filial recém-aberta deixaria o
   * vendedor inacessível para monitoria.
   */
  private async resolverLojaId(tx: Prisma.TransactionClient, nome: string): Promise<string> {
    const alvo = normalizar(nome);
    const lojas = await tx.loja.findMany({ select: { id: true, nome: true, ordem: true } });
    const achada = lojas.find((l) => normalizar(l.nome) === alvo);
    if (achada) return achada.id;

    const ordem = lojas.reduce((max, l) => Math.max(max, l.ordem), -1) + 1;
    const criada = await tx.loja.create({
      data: { nome: nome.trim(), ordem },
      select: { id: true },
    });
    this.logger.warn(`Loja "${nome}" criada a partir da replicação do RovalConnecta.`);
    return criada.id;
  }
}

/** Compara nomes de loja/filial sem acento e sem diferença de caixa. */
function normalizar(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase().replace(/\s+/g, ' ');
}
