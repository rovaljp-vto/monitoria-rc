import { BadRequestException, Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UsuarioAtual } from '../../common/decorators';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { UsuarioAutenticado } from '../../common/guards/session.guard';

const POR_PAGINA = 50;

/** Grupos de ação para o filtro da tela (prefixo da chave `acao`). */
const GRUPOS: Record<string, string[]> = {
  acesso: ['sso.'],
  monitorias: ['monitoria.'],
  cadastros: ['loja.', 'vendedor.', 'checklist.', 'parametros.'],
  integracao: ['sync.'],
};

/**
 * Auditoria — só para o administrador vindo do RovalConnecta (o superAdmin do
 * hub, vinculado ao admin local). Não é uma permissão do catálogo: nenhuma
 * marcação no hub dá acesso a esta tela.
 */
@Controller('api/auditoria')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async listar(
    @UsuarioAtual() u: UsuarioAutenticado,
    @Query('grupo') grupo?: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('busca') busca?: string,
    @Query('pagina') paginaTxt?: string,
  ) {
    if (!u.isAdminLocal) throw new ForbiddenException('A auditoria é exclusiva do administrador do RovalConnecta.');
    const dia = /^\d{4}-\d{2}-\d{2}$/;
    if ((de && !dia.test(de)) || (ate && !dia.test(ate))) throw new BadRequestException('Datas no formato AAAA-MM-DD.');
    if (grupo && !GRUPOS[grupo]) throw new BadRequestException('Grupo desconhecido.');
    const pagina = Math.max(1, Math.min(10_000, Number(paginaTxt) || 1));

    const where: Prisma.AuditLogWhereInput = {
      ...(grupo ? { OR: GRUPOS[grupo].map((p) => ({ acao: { startsWith: p } })) } : {}),
      // Dia inteiro no fuso de São Paulo (-03).
      ...(de || ate
        ? { criadoEm: { ...(de ? { gte: new Date(`${de}T00:00:00-03:00`) } : {}), ...(ate ? { lte: new Date(`${ate}T23:59:59.999-03:00`) } : {}) } }
        : {}),
      ...(busca?.trim() ? { atorNome: { contains: busca.trim(), mode: 'insensitive' } } : {}),
    };

    const [total, itens] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        skip: (pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
        select: { id: true, acao: true, atorNome: true, alvo: true, metadata: true, ip: true, criadoEm: true },
      }),
    ]);
    return { total, pagina, porPagina: POR_PAGINA, itens };
  }
}
