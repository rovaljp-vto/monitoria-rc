import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AppConfigModule } from './common/config/config.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { SessionGuard } from './common/guards/session.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { OrigemSeguraMiddleware } from './common/middleware/origem-segura.middleware';

import { AuditModule } from './modules/audit/audit.module';
import { SessionModule } from './modules/session/session.module';
import { SsoModule } from './modules/sso/sso.module';
import { SyncModule } from './modules/sync/sync.module';
import { DemoModule } from './modules/demo/demo.module';
import { CadastrosModule } from './modules/cadastros/cadastros.module';
import { ChecklistsModule } from './modules/checklists/checklists.module';
import { MonitoriasModule } from './modules/monitorias/monitorias.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { ManutencaoModule } from './modules/manutencao/manutencao.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Mesmo teto do RovalConnecta (120/min/IP); o SSO tem limite próprio mais apertado.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: Number(process.env.THROTTLE_LIMIT) || 120 }]),

    AppConfigModule,
    PrismaModule,
    AuditModule,

    SessionModule,
    SsoModule,
    SyncModule,
    DemoModule,
    CadastrosModule,
    ChecklistsModule,
    MonitoriasModule,
    UsuariosModule,
    ManutencaoModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    // A ordem importa: throttle → sessão → permissão.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Antes de guards e pipes: requisição de outro site nem chega a ser autenticada.
    consumer.apply(OrigemSeguraMiddleware).forRoutes('api/*path');
  }
}
