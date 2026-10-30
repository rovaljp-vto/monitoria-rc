import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  PERMISSOES_KEY,
  PERMISSOES_ALGUMA_KEY,
  PUBLICO_KEY,
} from '../decorators';
import { CATALOGO, type Permissao } from '../constants/permissions';

const NOME_DA_CHAVE = new Map(CATALOGO.map((p) => [p.key, p.nome]));

/**
 * Autorização por permissão granular — PERMISSOES.md e GUIA-INTEGRACAO §13.
 *
 * Duas regras não-negociáveis:
 *
 *  - Cargo, setor, username ou papel local não liberam funcionalidades. Aqui
 *    só existe a chave de permissão vinda do hub; não há nada mais a consultar.
 *  - A única exceção é o admin local, onde o superAdmin do hub é vinculado
 *    (GUIA-INTEGRACAO §6.2). O bypass fica NESTE ponto: um único lugar para
 *    auditar, em vez de um `if (isAdmin)` em cada rota.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLICO_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    const todas = this.reflector.getAllAndOverride<Permissao[]>(PERMISSOES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const alguma = this.reflector.getAllAndOverride<Permissao[]>(
      PERMISSOES_ALGUMA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!todas?.length && !alguma?.length) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const usuario = req.usuario;
    if (!usuario) return false; // SessionGuard já teria barrado

    if (usuario.isAdminLocal) return true;

    if (todas?.length) {
      const faltando = todas.filter((p) => !usuario.permissoes.has(p));
      if (faltando.length) throw this.negar(faltando);
    }

    if (alguma?.length && !alguma.some((p) => usuario.permissoes.has(p))) {
      throw this.negar(alguma, true);
    }

    return true;
  }

  /** Mensagem que diz o que falta e onde resolver (erros acionáveis). */
  private negar(chaves: Permissao[], qualquerUma = false): ForbiddenException {
    const nomes = chaves.map((c) => NOME_DA_CHAVE.get(c) ?? c);
    const lista = nomes.join(', ');
    return new ForbiddenException(
      qualquerUma
        ? `Esta ação exige pelo menos uma destas permissões: ${lista}. Solicite ao administrador no RovalConnecta.`
        : `Esta ação exige a permissão: ${lista}. Solicite ao administrador no RovalConnecta.`,
    );
  }
}
