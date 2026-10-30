import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import { AppModule } from './app.module';
import { APP_CONFIG, type AppConfig } from './common/config/app-config';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Bytes CRUS do corpo em `req.rawBody`: o HMAC do webhook é calculado sobre
    // eles. Um parser que reserializa o JSON derrubaria toda assinatura
    // (GUIA-INTEGRACAO §11).
    rawBody: true,
    bufferLogs: true,
  });

  const config = app.get<AppConfig>(APP_CONFIG);

  // Atrás de proxy reverso o IP real vem no X-Forwarded-For; sem isto o rate
  // limit trataria todos os usuários como um só.
  if (process.env.CONFIA_PROXY === 'true') app.set('trust proxy', 1);

  app.use(cookieParser());

  // CSP em todo ambiente. `unsafe-inline` só em estilo: o motion anima por
  // atributo `style`. Script inline continua proibido (por isso o tema inicial
  // mora em /tema.js, e não no index.html).
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          scriptSrcAttr: ["'none'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          ...(config.sessao.secure ? { upgradeInsecureRequests: [] } : {}),
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    next();
  });

  // Sem CORS: mesma origem. O SSO depende disso — o hub deriva
  // <origin-do-syncUrl>/sso/login.
  app.enableCors({ origin: false });

  const frontend = join(__dirname, '..', '..', 'frontend', 'dist');
  if (existsSync(frontend)) {
    // Arquivos de assets/ têm hash no nome: cache eterno. O index.html não
    // (vai com no-store no fallback abaixo), senão o navegador pediria os
    // bundles da versão anterior depois de um deploy.
    app.useStaticAssets(frontend, {
      index: false,
      setHeaders: (res, caminho) => {
        if (caminho.includes(`${sep}assets${sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    });
    logger.log(`Frontend servido de ${frontend}`);
  } else {
    logger.warn('frontend/dist não encontrado — rode o build do frontend para servir a interface.');
  }

  // SPA: rota que não é API devolve o index.html. `/assets/` inexistente é bundle
  // de versão anterior — 404 honesto, para o frontend perceber e recarregar.
  const express = app.getHttpAdapter().getInstance();
  express.get(
    /^(?!\/api|\/sso|\/assets\/).*/,
    (
      _req: unknown,
      res: {
        sendFile: (p: string) => void;
        setHeader: (k: string, v: string) => void;
        status: (c: number) => { send: (b: string) => void };
      },
    ) => {
      const index = join(frontend, 'index.html');
      if (!existsSync(index)) return res.status(503).send('Interface ainda não construída. Rode o build do frontend.');
      res.setHeader('Cache-Control', 'no-store, must-revalidate');
      return res.sendFile(index);
    },
  );

  await app.listen(config.port, '0.0.0.0');

  logger.log(`Checklist Comercial ouvindo em http://0.0.0.0:${config.port}`);
  logger.log('  webhook   POST /api/sync/users');
  logger.log('  catálogo  GET  /api/sync/permissions');
  logger.log('  SSO       GET  /sso/login');
  logger.log(`Cadastre no RovalConnecta com syncUrl = http://<ip-deste-servidor>:${config.port}/api/sync/users`);
}

bootstrap().catch((erro) => {
  console.error('\n✖ Falha ao iniciar o Checklist Comercial:\n  ' + (erro as Error).message + '\n');
  process.exit(1);
});
