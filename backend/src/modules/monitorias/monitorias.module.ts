import { Module } from '@nestjs/common';
import { CadastrosModule } from '../cadastros/cadastros.module';
import { MonitoriasController } from './monitorias.controller';
import { MonitoriasService } from './monitorias.service';
import { PainelService } from './painel.service';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [CadastrosModule],
  controllers: [MonitoriasController],
  providers: [MonitoriasService, PainelService, DashboardService],
})
export class MonitoriasModule {}
