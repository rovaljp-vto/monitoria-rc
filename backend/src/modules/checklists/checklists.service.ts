import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TipoModulo, TipoResposta } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { validarPesos } from '../../common/nota/motor';
import type { UsuarioAutenticado } from '../../common/guards/session.guard';

export const NovaVersaoSchema = z
  .object({
    perguntas: z
      .array(
        z
          .object({
            texto: z.string().trim().min(3).max(200),
            descricao: z.string().trim().max(500).nullish(),
            tipoResposta: z.nativeEnum(TipoResposta),
            peso: z.number().int().min(1).max(100),
            mensagemSim: z.string().trim().max(600).nullish(),
            mensagemNao: z.string().trim().max(600).nullish(),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();

export type NovaVersao = z.infer<typeof NovaVersaoSchema>;

const PERGUNTAS_ORDENADAS = { orderBy: { ordem: 'asc' as const } };

/**
 * Checklists versionados — escopo §3.5 e regra 2.
 *
 * Uma versão nunca é editada: mudar pergunta ou peso cria a próxima. As
 * monitorias antigas continuam apontando para a versão com que foram
 * calculadas, e a nota delas não se move.
 */
@Injectable()
export class ChecklistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async vigente(tipo: TipoModulo) {
    const versao = await this.prisma.checklistVersao.findFirst({
      where: { ativa: true, checklist: { tipo } },
      orderBy: { numero: 'desc' },
      include: { perguntas: PERGUNTAS_ORDENADAS, checklist: { select: { nome: true, tipo: true } } },
    });
    if (!versao) {
      throw new NotFoundException(
        'Nenhum checklist vigente para este módulo. Rode o seed ou cadastre o checklist na Administração.',
      );
    }
    return versao;
  }

  historico(tipo: TipoModulo) {
    return this.prisma.checklistVersao.findMany({
      where: { checklist: { tipo } },
      orderBy: { numero: 'desc' },
      include: {
        perguntas: PERGUNTAS_ORDENADAS,
        criadaPor: { select: { nome: true } },
        _count: { select: { monitorias: true } },
      },
    });
  }

  async novaVersao(tipo: TipoModulo, dto: NovaVersao, ator: UsuarioAutenticado) {
    const problema = validarPesos(dto.perguntas);
    if (problema) throw new BadRequestException(problema);

    const checklist = await this.prisma.checklist.findUnique({ where: { tipo } });
    if (!checklist) throw new NotFoundException('Checklist não encontrado. Rode o seed.');

    const versao = await this.prisma.$transaction(async (tx) => {
      const ultima = await tx.checklistVersao.findFirst({
        where: { checklistId: checklist.id },
        orderBy: { numero: 'desc' },
        select: { numero: true },
      });
      await tx.checklistVersao.updateMany({ where: { checklistId: checklist.id, ativa: true }, data: { ativa: false } });
      return tx.checklistVersao.create({
        data: {
          checklistId: checklist.id,
          numero: (ultima?.numero ?? 0) + 1,
          criadaPorId: ator.id,
          perguntas: {
            create: dto.perguntas.map((p, i) => ({
              texto: p.texto,
              descricao: p.descricao || null,
              tipoResposta: p.tipoResposta,
              peso: p.peso,
              mensagemSim: p.mensagemSim || null,
              mensagemNao: p.mensagemNao || null,
              ordem: i + 1,
            })),
          },
        },
        include: { perguntas: PERGUNTAS_ORDENADAS },
      });
    });

    await this.audit.registrar({
      acao: 'checklist.nova-versao',
      atorId: ator.id,
      atorNome: ator.nome,
      alvo: versao.id,
      metadata: { tipo, numero: versao.numero, perguntas: dto.perguntas },
    });
    return versao;
  }
}
