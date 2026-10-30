import { Logger } from '@nestjs/common';

/**
 * Configuração validada uma única vez, no boot.
 *
 * O sistema recusa subir sem ROVAL_SYNC_SECRET: sem ele o webhook e o SSO
 * ficariam abertos ou permanentemente quebrados — falhar cedo e alto é melhor
 * que descobrir quando o primeiro usuário tentar entrar.
 */
export interface AppConfig {
  port: number;
  producao: boolean;
  rovalSyncSecret: string;
  rovalModuleId: string | null;
  sessao: {
    cookieName: string;
    idleMinutes: number;
    maxHours: number;
    secure: boolean;
  };
  timezone: string;
  /** Endereço do hub, para o botão "Ir para o RovalConnecta" da tela sem sessão. */
  rovalConnectaUrl: string;
  /** Porta de demonstração em /entrar. Nunca em produção. */
  demoLogin: boolean;
}

function num(valor: string | undefined, padrao: number): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : padrao;
}

function bool(valor: string | undefined, padrao: boolean): boolean {
  if (valor === undefined || valor === '') return padrao;
  return valor === 'true' || valor === '1';
}

export function carregarConfig(): AppConfig {
  const logger = new Logger('Config');
  const producao = process.env.NODE_ENV === 'production';

  const rovalSyncSecret = process.env.ROVAL_SYNC_SECRET?.trim() ?? '';
  if (!rovalSyncSecret) {
    throw new Error(
      'ROVAL_SYNC_SECRET não configurado. É o mesmo valor do campo "Segredo HMAC" ' +
        'em Gestão de Sistemas → Checklist Comercial, no RovalConnecta. ' +
        'Sem ele o webhook de replicação e o SSO não funcionam.',
    );
  }
  if (rovalSyncSecret.length < 32) {
    logger.warn(
      `ROVAL_SYNC_SECRET tem apenas ${rovalSyncSecret.length} caracteres. ` +
        'O painel gera 64 (32 bytes hex) — confira se o valor foi colado inteiro.',
    );
  }

  /**
   * Cookie de sessão sem HTTPS em produção: a aplicação não sobe, a menos que
   * a escolha seja assumida em PERMITIR_SESSAO_SEM_HTTPS — variável que nenhum
   * .env de desenvolvimento define por acaso.
   */
  const secure = bool(process.env.SESSION_COOKIE_SECURE, producao);
  if (producao && !secure) {
    if (!bool(process.env.PERMITIR_SESSAO_SEM_HTTPS, false)) {
      throw new Error(
        'SESSION_COOKIE_SECURE=false em produção: o cookie de sessão viajaria sem ' +
          'HTTPS. Sirva por HTTPS e remova SESSION_COOKIE_SECURE, ou, se este servidor ' +
          'só atende em HTTP dentro da rede interna, assuma com PERMITIR_SESSAO_SEM_HTTPS=true.',
      );
    }
    logger.warn(
      'Sessão sem HTTPS por decisão explícita (PERMITIR_SESSAO_SEM_HTTPS=true): ' +
        'aceitável só em rede interna fechada.',
    );
  }

  const moduleId = process.env.ROVAL_MODULE_ID?.trim() || null;
  if (!moduleId) {
    logger.warn('ROVAL_MODULE_ID vazio: o SSO aceitará tokens de qualquer módulo. Preencha em produção.');
  }

  return {
    port: num(process.env.PORT, 3005),
    producao,
    rovalSyncSecret,
    rovalModuleId: moduleId,
    sessao: {
      cookieName: process.env.SESSION_COOKIE_NAME || 'monitoria_sid',
      idleMinutes: num(process.env.SESSION_IDLE_MINUTES, 120),
      maxHours: num(process.env.SESSION_MAX_HOURS, 12),
      secure,
    },
    timezone: process.env.TIMEZONE || 'America/Sao_Paulo',
    rovalConnectaUrl: (process.env.ROVAL_CONNECTA_URL || '').trim() || 'http://192.168.1.4:3000',
    // Dupla trava: o flag sozinho não basta, produção nunca habilita.
    demoLogin: !producao && bool(process.env.DEMO_LOGIN, false),
  };
}

export const APP_CONFIG = 'APP_CONFIG';
