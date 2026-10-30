import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, carregarConfig } from './app-config';

/**
 * Configuração da aplicação, disponível em todo o grafo de injeção.
 *
 * Precisa ser um módulo `@Global` de verdade: um provider declarado apenas em
 * `AppModule.providers` fica visível para o próprio AppModule, e NÃO para os
 * módulos que ele importa. Sem isto, todo service que injeta `APP_CONFIG`
 * (sessão, SSO, sync, realtime, SLA, anexos) falha na resolução ao subir.
 */
@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: carregarConfig }],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
