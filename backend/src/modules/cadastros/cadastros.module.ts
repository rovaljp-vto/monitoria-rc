import { Module } from '@nestjs/common';
import { CadastrosController } from './cadastros.controller';
import { CadastrosService } from './cadastros.service';
import { LotacaoService } from './lotacao.service';

@Module({
  controllers: [CadastrosController],
  providers: [CadastrosService, LotacaoService],
  exports: [CadastrosService, LotacaoService],
})
export class CadastrosModule {}
