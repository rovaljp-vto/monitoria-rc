import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Envelope de erro idêntico ao do RovalConnecta (API.md, "Códigos de erro"):
 *   { statusCode, message, error, path, timestamp }
 *
 * Manter o mesmo formato importa: quem opera os dois sistemas lê os erros da
 * mesma forma, e ferramentas de diagnóstico não precisam de caso especial.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Erro interno';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const corpo = exception.getResponse();
      if (typeof corpo === 'string') {
        message = corpo;
        error = exception.name;
      } else if (corpo && typeof corpo === 'object') {
        const obj = corpo as Record<string, unknown>;
        message = (obj.message as string | string[]) ?? exception.message;
        error = (obj.error as string) ?? exception.name;
      }
    } else if (exception instanceof Error) {
      // Erro não previsto: a mensagem interna fica no log, não na resposta.
      this.logger.error(
        `${request.method} ${request.url} — ${exception.message}`,
        exception.stack,
      );
    }

    if (status >= 500) {
      this.logger.error(`${status} ${request.method} ${request.url}`);
    }

    response.status(status).json({
      statusCode: status,
      message,
      error,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
