import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../common/config/app-config';
import { LotacaoService } from './lotacao.service';
import { Prisma, type Parametros } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { UsuarioAutenticado } from '../../common/guards/session.guard';
import type { LojaCriar, LojaEditar, ParametrosDto, VendedorEditar } from './cadastros.schemas';

/** Cadastros e parâmetros — escopo §4.6. */
@Injectable()
export class CadastrosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly lotacao: LotacaoService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ── Lojas ────────────────────────────────────────────────────────────────

  listarLojas(incluirInativas: boolean) {
    return this.prisma.loja.findMany({
      where: incluirInativas ? {} : { ativa: true },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
      select: {
        id: true,
        nome: true,
        ativa: true,
        ordem: true,
        _count: { select: { vendedores: { where: { ativo: true } } } },
      },
    });
  }

  async criarLoja(dto: LojaCriar, ator: UsuarioAutenticado) {
    try {
      const loja = await this.prisma.loja.create({ data: { nome: dto.nome, ordem: dto.ordem ?? 0 } });
      await this.auditar('loja.criar', ator, loja.id, { nome: loja.nome });
      return loja;
    } catch (e) {
      throw this.duplicado(e, `Já existe uma loja chamada "${dto.nome}".`);
    }
  }

  async editarLoja(id: string, dto: LojaEditar, ator: UsuarioAutenticado) {
    const atual = await this.prisma.loja.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('Loja não encontrada.');

    const data: Prisma.LojaUpdateInput = { ...dto };
    // A data de inativação decide a cobertura do mês (regra 6, estendida a lojas).
    if (dto.ativa === false && atual.ativa) data.inativadaEm = new Date();
    if (dto.ativa === true && !atual.ativa) data.inativadaEm = null;

    try {
      const loja = await this.prisma.loja.update({ where: { id }, data });
      await this.auditar('loja.editar', ator, id, { antes: atual, depois: dto });
      return loja;
    } catch (e) {
      throw this.duplicado(e, `Já existe uma loja chamada "${dto.nome}".`);
    }
  }

  // ── Vendedores ───────────────────────────────────────────────────────────

  listarVendedores(filtro: { lojaId?: string; incluirInativos: boolean }) {
    return this.prisma.vendedor.findMany({
      where: {
        ...(filtro.lojaId ? { lojaId: filtro.lojaId } : {}),
        ...(filtro.incluirInativos ? {} : { ativo: true }),
      },
      orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
      select: {
        id: true,
        nome: true,
        ativo: true,
        admissao: true,
        inativadoEm: true,
        // Replicados do RovalConnecta: a tela trava a edição desses cadastros.
        codigoFuncionario: true,
        rovalManaged: true,
        loja: { select: { id: true, nome: true } },
      },
    });
  }

  // out/2026 — `criarVendedor` foi removido junto com o POST /vendedores: o
  // cadastro de vendedor é do RovalConnecta e chega por `vendedor.upsert`
  // (ver `modules/sync/vendedor-sync.service.ts`), que também abre a lotação
  // inicial a partir do histórico que o hub manda.

  /** Nome, admissão e situação. Mudança de loja é transferência (LotacaoService). */
  async editarVendedor(id: string, dto: VendedorEditar, ator: UsuarioAutenticado) {
    const atual = await this.prisma.vendedor.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('Vendedor(a) não encontrado(a).');
    // Cadastro replicado do hub: nome e situação vêm de lá e seriam reescritos
    // pelo próximo webhook. Só `admissao` é local (o hub não tem esse dado).
    if (atual.rovalManaged && (dto.nome !== atual.nome || dto.ativo !== atual.ativo)) {
      throw new BadRequestException(
        `${atual.nome} é um cadastro gerenciado pelo RovalConnecta — nome e situação se alteram lá, `
        + 'em Administração → Usuários, e chegam aqui automaticamente.',
      );
    }

    const data: Prisma.VendedorUncheckedUpdateInput = {
      nome: dto.nome,
      ativo: dto.ativo,
    };
    if (dto.admissao !== undefined) data.admissao = dto.admissao ? new Date(dto.admissao) : null;
    // Regra 6 — inativado no meio do mês sai da cobertura daquele mês.
    if (dto.ativo === false && atual.ativo) data.inativadoEm = new Date();
    if (dto.ativo === true && !atual.ativo) data.inativadoEm = null;

    const vendedor = await this.prisma.vendedor.update({ where: { id }, data });
    await this.auditar('vendedor.editar', ator, id, { antes: { nome: atual.nome, ativo: atual.ativo }, depois: dto });
    return vendedor;
  }

  // ── Parâmetros ───────────────────────────────────────────────────────────

  /** Linha única; nasce com os valores sugeridos no escopo se ainda não existir. */
  parametros(): Promise<Parametros> {
    return this.prisma.parametros.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  }

  async salvarParametros(dto: ParametrosDto, ator: UsuarioAutenticado) {
    const antes = await this.parametros();
    const depois = await this.prisma.parametros.update({ where: { id: 1 }, data: dto });
    await this.auditar('parametros.editar', ator, '1', { antes, depois: dto });
    return depois;
  }

  // ── Auxiliares ───────────────────────────────────────────────────────────

  private duplicado(erro: unknown, mensagem: string): unknown {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      return new ConflictException(mensagem);
    }
    return erro;
  }

  private auditar(acao: string, ator: UsuarioAutenticado, alvo: string, metadata: Record<string, unknown>) {
    return this.audit.registrar({ acao, atorId: ator.id, atorNome: ator.nome, alvo, metadata });
  }
}
