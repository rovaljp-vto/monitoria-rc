import { HttpStatus, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Proteção contra CSRF nas rotas que mudam estado.
 *
 * O cookie de sessão já sai com `SameSite=Lax`, o que impede o navegador de
 * mandá-lo num POST vindo de outro site. Esta camada existe para não depender
 * só disso: navegador antigo, subdomínio
 * irmão sob o mesmo site, ou uma mudança futura no cookie reabririam a porta.
 *
 * Duas checagens, as mesmas da OWASP CSRF Prevention Cheat Sheet:
 *
 *  1. **De onde veio.** `Sec-Fetch-Site` é preenchido pelo navegador e não pode
 *     ser forjado por JavaScript. Só `same-origin` (a própria aplicação) e
 *     `none` (ação direta da pessoa) passam. Navegador que não manda o
 *     cabeçalho cai no `Origin`, que precisa ser este mesmo host.
 *     Chamada servidor-a-servidor (webhook do RovalConnecta) não manda nenhum
 *     dos dois — e se autentica por HMAC, não por cookie.
 *
 *  2. **Como veio.** Formulário HTML consegue enviar para outro site só três
 *     tipos de corpo: `x-www-form-urlencoded`, `multipart/form-data` e
 *     `text/plain`. A API fala JSON; o `multipart` só é aceito nas poucas
 *     rotas que recebem arquivo, que continuam protegidas pela checagem 1.
 */

const METODOS_DE_ESCRITA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Únicas rotas que aceitam multipart. Continuam protegidas pela checagem de origem.
const ROTAS_DE_ARQUIVO: RegExp[] = [/^\/api\/observacoes\/[^/]+\/imagens\/?$/, /^\/api\/feedbacks\/[^/]+\/imagens\/?$/];

const ORIGENS_ACEITAS = new Set(['same-origin', 'none']);

@Injectable()
export class OrigemSeguraMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    if (!METODOS_DE_ESCRITA.has(req.method)) return next();

    const caminho = req.originalUrl.split('?')[0];

    if (!this.mesmaOrigem(req)) {
      res.status(HttpStatus.FORBIDDEN).json({
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Requisição recusada: ela não partiu desta aplicação.',
        error: 'Forbidden',
        path: caminho,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const tipo = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    const temCorpo =
      Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding'] !== undefined;

    const aceito =
      (!tipo && !temCorpo) ||
      tipo === 'application/json' ||
      (tipo === 'multipart/form-data' && ROTAS_DE_ARQUIVO.some((r) => r.test(caminho)));

    if (!aceito) {
      res.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE).json({
        statusCode: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        message: 'Formato não aceito: envie os dados como JSON.',
        error: 'Unsupported Media Type',
        path: caminho,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    next();
  }

  private mesmaOrigem(req: Request): boolean {
    const site = req.headers['sec-fetch-site'];
    if (typeof site === 'string') return ORIGENS_ACEITAS.has(site.toLowerCase());

    const origem = req.headers.origin;
    if (origem === undefined) return true;

    try {
      const host = new URL(origem).host;
      // Atrás de proxy reverso o Host pode ter sido reescrito; o original vem aqui.
      const encaminhado = req.headers['x-forwarded-host'];
      return (
        host === req.headers.host ||
        (typeof encaminhado === 'string' && host === encaminhado.split(',')[0].trim())
      );
    } catch {
      // `Origin: null` (iframe com sandbox, redirect entre origens) não é esta aplicação.
      return false;
    }
  }
}
