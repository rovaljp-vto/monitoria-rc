import { Module } from '@nestjs/common';
import { CadastrosModule } from '../cadastros/cadastros.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { VendedorSyncService } from './vendedor-sync.service';

@Module({
  // CadastrosModule entra pelo `LotacaoService`: a replicação de vendedor
  // reusa o realinhamento de monitorias dele, para não existirem duas
  // implementações da mesma regra.
  imports: [CadastrosModule],
  controllers: [SyncController],
  providers: [SyncService, VendedorSyncService],
  exports: [SyncService],
})
export class SyncModule {}
