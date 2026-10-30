import { Injectable, Logger } from '@nestjs/common';
import { EstadoUsuario, Prisma, ResultadoSync } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  PERMISSOES_PADRAO,
  dependenciasFaltantes,
  filtrarChaves,
} from '../../common/constants/permissions';
import type { UsuarioRoval, EventoSync, EventoVendedor } from './sync.schemas';
import { VendedorSyncService } from './vendedor-sync.service';

export interface ResultadoProcessamento {
  externalId: string | null;
  chavesIgnoradas: string[];
}

/**
 * Aplicação dos eventos de replicação do RovalConnecta.
 *
 * Contrato: INTEGRATION.md; GUIA-INTEGRACAO-SISTEMAS.md §6 e §13.2.
 *
 * Tudo aqui é IDEMPOTENTE: o hub reenvia o mesmo evento até 3
 * vezes com backoff, e um backfill reenvia a base inteira. Reprocessar precisa
 * chegar ao mesmo estado, nunca duplicar.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly vendedores: VendedorSyncService,
  ) {}

  async processar(
    evento: EventoSync,
    payloadCru: unknown,
  ): Promise<ResultadoProcessamento> {
    try {
      const resultado = await this.despachar(evento);
      await this.gravarLog(evento, payloadCru, ResultadoSync.OK, null, resultado.chavesIgnoradas);
      return resultado;
    } catch (erro) {
      const msg = (erro as Error).message;
      await this.gravarLog(evento, payloadCru, ResultadoSync.ERRO, msg, []);
      throw erro;
    }
  }

  /**
   * Trilha de VENDEDOR — cadastro + histórico de lotação replicados do hub.
   *
   * Delegada ao `VendedorSyncService`: nada ali toca `usuarios`. O log vai
   * para o mesmo `roval_sync_log`, que é o que alimenta o diagnóstico em
   * produção (GUIA-INTEGRACAO §7).
   */
  async processarVendedor(
    evento: EventoVendedor,
    payloadCru: unknown,
  ): Promise<{ externalId: string | null }> {
    try {
      const resultado = await this.vendedores.processar(evento.event, evento.vendedor);
      await this.gravarLogVendedor(evento, payloadCru, ResultadoSync.OK, null);
      return resultado;
    } catch (erro) {
      const msg = (erro as Error).message;
      await this.gravarLogVendedor(evento, payloadCru, ResultadoSync.ERRO, msg);
      throw erro;
    }
  }

  private gravarLogVendedor(
    evento: EventoVendedor,
    payload: unknown,
    resultado: ResultadoSync,
    erroMsg: string | null,
  ) {
    return this.prisma.syncLog
      .create({
        data: {
          evento: evento.event,
          codigoFuncionario: evento.vendedor.codigoFuncionario ?? null,
          payload: payload as object,
          resultado,
          erroMsg,
          assinaturaOk: true, // só chega aqui depois do HMAC validar
          chavesIgnoradas: [],
        },
      })
      .catch((e: Error) =>
        this.logger.error(`Falha ao gravar roval_sync_log (vendedor): ${e.message}`),
      );
  }

  private despachar(evento: EventoSync): Promise<ResultadoProcessamento> {
    switch (evento.event) {
      case 'user.upsert':
        return this.upsert(evento.user);
      case 'user.disable':
        return this.disable(evento.user);
      case 'user.delete':
        return this.delete(evento.user);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // user.upsert
  // ───────────────────────────────────────────────────────────────────────────

  private async upsert(user: UsuarioRoval): Promise<ResultadoProcessamento> {
    return user.superAdmin ? this.vincularAdmin(user) : this.upsertComum(user);
  }

  /**
   * GUIA-INTEGRACAO §6.2 — o superAdmin é VINCULADO ao admin
   * local pré-existente. Nunca se cria um segundo superadministrador.
   *
   * As permissões do payload são ignoradas aqui (GUIA-INTEGRACAO §13.2,
   * item 3: "Nunca toque no admin local").
   */
  private async vincularAdmin(user: UsuarioRoval): Promise<ResultadoProcessamento> {
    return this.prisma.$transaction(async (tx) => {
      const admin = await tx.usuario.findFirst({ where: { isAdminLocal: true } });
      if (!admin) {
        // Só acontece se o seed não rodou. É erro 5xx de propósito: o hub
        // reenvia, e o administrador vê a falha em vez de um silêncio.
        throw new Error(
          'Admin local não encontrado. Rode o seed antes de ativar a replicação.',
        );
      }

      // O código pode estar preso a um registro comum — caso de alguém que era
      // colaborador e foi promovido a ADMIN no hub. `codigoFuncionario` é
      // único, então ele precisa ser liberado antes de migrar para o admin.
      if (user.codigoFuncionario) {
        await tx.usuario.updateMany({
          where: {
            codigoFuncionario: user.codigoFuncionario,
            id: { not: admin.id },
          },
          data: { codigoFuncionario: null, linkedToRoval: false },
        });
      }

      await tx.usuario.update({
        where: { id: admin.id },
        data: {
          nomeRoval: user.nome,
          usernameRoval: user.username,
          rovalUserId: user.id,
          codigoFuncionario: user.codigoFuncionario,
          telefone: user.telefone ?? admin.telefone,
          filial: user.filial ?? admin.filial,
          setor: user.setor ?? admin.setor,
          cargo: user.cargo ?? admin.cargo,
          linkedToRoval: true,
          estado: EstadoUsuario.ATIVO,
          lastRovalSyncAt: new Date(),
        },
      });

      await this.audit.registrar({
        acao: 'sync.admin.vinculado',
        alvo: admin.id,
        metadata: { codigoFuncionario: user.codigoFuncionario, username: user.username },
      });

      return { externalId: admin.id, chavesIgnoradas: [] };
    });
  }

  private async upsertComum(user: UsuarioRoval): Promise<ResultadoProcessamento> {
    const codigo = user.codigoFuncionario;
    if (!codigo) {
      throw new Error(
        'codigoFuncionario ausente no payload — é a chave estável de associação (GUIA-INTEGRACAO §2).',
      );
    }

    const { validas, ignoradas } = filtrarChaves(user.permissions);
    const gerenciado = user.permissionsManaged === true;

    if (ignoradas.length) {
      // GUIA-INTEGRACAO §13.2, item 2: chave desconhecida é ignorada com
      // warning, nunca erro.
      this.logger.warn(
        `Chaves fora do catálogo ignoradas para ${codigo}: ${ignoradas.join(', ')}`,
      );
    }
    const faltantes = gerenciado ? dependenciasFaltantes(validas) : [];
    if (faltantes.length) {
      this.logger.warn(
        `Dependências de permissão não atendidas para ${codigo}: ${faltantes.join('; ')}`,
      );
    }

    const externalId = await this.prisma.$transaction(async (tx) => {
      // GUIA-INTEGRACAO §6.3 — rebaixamento: quem era superAdmin e voltou a ser
      // colaborador precisa soltar o vínculo do admin local ANTES de reaparecer
      // como usuário comum. O admin local permanece intacto.
      const adminVinculado = await tx.usuario.findFirst({
        where: { isAdminLocal: true, codigoFuncionario: codigo },
      });
      if (adminVinculado) {
        await tx.usuario.update({
          where: { id: adminVinculado.id },
          data: {
            linkedToRoval: false,
            codigoFuncionario: null,
            rovalUserId: null,
            usernameRoval: null,
            nomeRoval: null,
          },
        });
        await this.audit.registrar({
          acao: 'sync.admin.desvinculado',
          alvo: adminVinculado.id,
          metadata: { codigoFuncionario: codigo, motivo: 'rebaixamento no RovalConnecta' },
        });
      }

      const existente = await tx.usuario.findUnique({
        where: { codigoFuncionario: codigo },
        include: { permissoes: { select: { chave: true } } },
      });

      // Estado global vindo do hub. `bloqueado` manda sobre `ativo`.
      const bloqueado = user.bloqueado === true || user.ativo === false;

      // Um upsert reverte a exclusão: o hub voltou a conceder o sistema.
      // É o outro lado da decisão de projeto tomada em user.delete.
      const permissoesFinais = gerenciado
        ? validas
        : existente
          ? existente.permissoes.map((p) => p.chave)
          : // Sem gestão central: acesso mínimo seguro (GUIA-INTEGRACAO §13.2,
            // item 4: "nunca acesso total").
            [...PERMISSOES_PADRAO];

      const estado: EstadoUsuario = bloqueado
        ? EstadoUsuario.BLOQUEADO
        : permissoesFinais.length > 0
          ? EstadoUsuario.ATIVO
          : // Sem nenhuma permissão não há sessão possível (PERMISSOES.md);
            // PENDENTE deixa isso explícito na tela de diagnóstico.
            EstadoUsuario.PENDENTE;

      const dadosComuns = {
        nome: user.nome,
        telefone: user.telefone ?? null,
        filial: user.filial ?? null,
        setor: user.setor ?? null,
        cargo: user.cargo ?? null,
        rovalUserId: user.id,
        usernameRoval: user.username,
        nomeRoval: user.nome,
        linkedToRoval: true,
        permissionsManaged: gerenciado,
        estado,
        bloqueadoEm: bloqueado ? (existente?.bloqueadoEm ?? new Date()) : null,
        excluidoEm: null,
        lastRovalSyncAt: new Date(),
      };

      let usuarioId: string;
      if (existente) {
        await tx.usuario.update({ where: { id: existente.id }, data: dadosComuns });
        usuarioId = existente.id;
      } else {
        const criado = await tx.usuario.create({
          data: {
            ...dadosComuns,
            codigoFuncionario: codigo,
            username: await this.usernameDisponivel(tx, user.username, codigo),
            origem: 'ROVAL',
          },
        });
        usuarioId = criado.id;
      }

      // Semântica REPLACE (GUIA-INTEGRACAO §13.2).
      // Sem gestão central e com usuário já existente, nada é tocado.
      if (gerenciado || !existente) {
        await this.substituirPermissoes(tx, usuarioId, permissoesFinais);
      }

      if (bloqueado) {
        await this.encerrarSessoes(tx, usuarioId, 'bloqueado-no-roval');
      }

      return usuarioId;
    });

    return { externalId, chavesIgnoradas: ignoradas };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // user.disable / user.delete
  // ───────────────────────────────────────────────────────────────────────────

  /** GUIA-INTEGRACAO §6.4 — bloqueio. Não exclui: pode ser temporário. */
  private async disable(user: UsuarioRoval): Promise<ResultadoProcessamento> {
    const alvo = await this.localizar(user);
    if (!alvo) return { externalId: null, chavesIgnoradas: [] }; // idempotente

    if (alvo.isAdminLocal) {
      // O hub não bloqueia o admin raiz (GUIA-CRIACAO §9), mas se algum dia
      // chegar, o operador de manutenção não pode se trancar para fora.
      this.logger.warn('user.disable recebido para o admin local — ignorado.');
      return { externalId: alvo.id, chavesIgnoradas: [] };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: alvo.id },
        data: {
          estado: EstadoUsuario.BLOQUEADO,
          bloqueadoEm: new Date(),
          lastRovalSyncAt: new Date(),
        },
      });
      // Bloqueio encerra as sessões ativas na hora.
      await this.encerrarSessoes(tx, alvo.id, 'user.disable');
    });

    await this.audit.registrar({
      acao: 'sync.user.disable',
      alvo: alvo.id,
      metadata: { codigoFuncionario: user.codigoFuncionario },
    });
    return { externalId: alvo.id, chavesIgnoradas: [] };
  }

  /**
   * user.delete — REVOGAÇÃO DE ACESSO, com dados preservados.
   *
   * Decisão de projeto, tomada porque o evento é ambíguo nos documentos:
   *   - GUIA-CRIACAO §8 e COMO-CONFIGURAR B.3: o hub dispara `user.delete`
   *     também quando o admin apenas DESMARCA este sistema nas permissões do
   *     usuário — ninguém foi excluído de lugar nenhum.
   *   - Escopo, regras 5 e 7: monitorias e observações guardam autor e não
   *     podem ser apagadas.
   *
   * Anonimizar aqui destruiria o cadastro de quem apenas perdeu o card. Então:
   * revoga o acesso, encerra sessões, zera permissões — e preserva nome,
   * monitorias registradas, observações e histórico. Um `user.upsert` posterior reativa.
   */
  private async delete(user: UsuarioRoval): Promise<ResultadoProcessamento> {
    const alvo = await this.localizar(user);
    if (!alvo) return { externalId: null, chavesIgnoradas: [] }; // idempotente

    if (alvo.isAdminLocal) {
      // GUIA-CRIACAO §9: o admin raiz não pode ser excluído. Se o evento vier
      // por rebaixamento, o vínculo cai mas o admin local sobrevive.
      await this.prisma.usuario.update({
        where: { id: alvo.id },
        data: {
          linkedToRoval: false,
          codigoFuncionario: null,
          rovalUserId: null,
          usernameRoval: null,
          nomeRoval: null,
        },
      });
      this.logger.warn('user.delete recebido para o admin local — vínculo removido, conta preservada.');
      return { externalId: alvo.id, chavesIgnoradas: [] };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: alvo.id },
        data: {
          estado: EstadoUsuario.EXCLUIDO,
          excluidoEm: new Date(),
          linkedToRoval: false,
          lastRovalSyncAt: new Date(),
        },
      });
      await tx.usuarioPermissao.deleteMany({ where: { usuarioId: alvo.id } });
      await this.encerrarSessoes(tx, alvo.id, 'user.delete');
    });

    await this.audit.registrar({
      acao: 'sync.user.delete',
      alvo: alvo.id,
      metadata: {
        codigoFuncionario: user.codigoFuncionario,
        politica: 'revogar-acesso-preservar-dados',
      },
    });
    return { externalId: alvo.id, chavesIgnoradas: [] };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Auxiliares
  // ───────────────────────────────────────────────────────────────────────────

  private localizar(user: UsuarioRoval) {
    if (!user.codigoFuncionario) return Promise.resolve(null);
    return this.prisma.usuario.findUnique({
      where: { codigoFuncionario: user.codigoFuncionario },
      select: { id: true, isAdminLocal: true },
    });
  }

  private async substituirPermissoes(
    tx: Prisma.TransactionClient,
    usuarioId: string,
    chaves: string[],
  ): Promise<void> {
    await tx.usuarioPermissao.deleteMany({
      where: { usuarioId, chave: { notIn: chaves.length ? chaves : ['__none__'] } },
    });
    if (chaves.length) {
      await tx.usuarioPermissao.createMany({
        data: chaves.map((chave) => ({ usuarioId, chave })),
        skipDuplicates: true,
      });
    }
  }

  private encerrarSessoes(
    tx: Prisma.TransactionClient,
    usuarioId: string,
    motivo: string,
  ) {
    return tx.sessao.updateMany({
      where: { usuarioId, encerradaEm: null },
      data: { encerradaEm: new Date(), motivoEncerramento: motivo },
    });
  }

  /**
   * `username` é único localmente. O hub garante unicidade do lado dele, mas
   * uma conta local pré-existente pode ter tomado o nome — sufixar é melhor do
   * que falhar a replicação por um detalhe cosmético (o vínculo real é o código).
   */
  private async usernameDisponivel(
    tx: Prisma.TransactionClient,
    desejado: string,
    codigo: string,
  ): Promise<string> {
    const base = desejado?.trim() || `${codigo}-USUARIO`;
    if (!(await tx.usuario.findUnique({ where: { username: base } }))) return base;
    return `${base}__${codigo}`;
  }

  private gravarLog(
    evento: EventoSync,
    payload: unknown,
    resultado: ResultadoSync,
    erroMsg: string | null,
    chavesIgnoradas: string[],
  ) {
    // GUIA-INTEGRACAO §7 — tabela `roval_sync_log`: "Toda vez que receber um
    // webhook, registre — facilita o debug em produção."
    return this.prisma.syncLog
      .create({
        data: {
          evento: evento.event,
          codigoFuncionario: evento.user.codigoFuncionario ?? null,
          payload: payload as object,
          resultado,
          erroMsg,
          assinaturaOk: true, // só chega aqui depois do HMAC validar
          chavesIgnoradas,
        },
      })
      .catch((e: Error) =>
        this.logger.error(`Falha ao gravar roval_sync_log: ${e.message}`),
      );
  }

  /** Registra tentativa rejeitada na porta (assinatura/timestamp). */
  async registrarRejeicao(motivo: string, corpo: unknown): Promise<void> {
    await this.prisma.syncLog
      .create({
        data: {
          evento: 'rejeitado',
          payload: (corpo ?? {}) as object,
          resultado: ResultadoSync.ERRO,
          erroMsg: motivo,
          assinaturaOk: false,
          chavesIgnoradas: [],
        },
      })
      .catch(() => undefined);
  }
}
