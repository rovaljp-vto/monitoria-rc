import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { LotacaoService, TransferirSchema, type Transferir } from './lotacao.service';
import { RequerAlguma, RequerPermissao, UsuarioAtual } from '../../common/decorators';
import { PERMISSOES } from '../../common/constants/permissions';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import type { UsuarioAutenticado } from '../../common/guards/session.guard';
import { CadastrosService } from './cadastros.service';
import {
  LojaCriarSchema,
  LojaEditarSchema,
  ParametrosSchema,
  VendedorEditarSchema,
  type LojaCriar,
  type LojaEditar,
  type ParametrosDto,
  type VendedorEditar,
} from './cadastros.schemas';

const { VENDEDORES_VER, LOJAS_VER, CADASTROS_GERENCIAR } = PERMISSOES;

@Controller('api')
export class CadastrosController {
  constructor(
    private readonly cadastros: CadastrosService,
    private readonly lotacao: LotacaoService,
  ) {}

  /** Lojas aparecem nos dois módulos (filtro de cobertura e formulário). */
  @Get('lojas')
  @RequerAlguma(VENDEDORES_VER, LOJAS_VER, CADASTROS_GERENCIAR)
  lojas(@Query('todas') todas?: string) {
    return this.cadastros.listarLojas(todas === '1');
  }

  @Post('lojas')
  @RequerPermissao(CADASTROS_GERENCIAR)
  criarLoja(@Body(zodPipe(LojaCriarSchema)) dto: LojaCriar, @UsuarioAtual() u: UsuarioAutenticado) {
    return this.cadastros.criarLoja(dto, u);
  }

  @Patch('lojas/:id')
  @RequerPermissao(CADASTROS_GERENCIAR)
  editarLoja(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(LojaEditarSchema)) dto: LojaEditar,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.cadastros.editarLoja(id, dto, u);
  }

  @Get('vendedores')
  @RequerAlguma(VENDEDORES_VER, CADASTROS_GERENCIAR)
  vendedores(@Query('lojaId') lojaId?: string, @Query('todos') todos?: string) {
    return this.cadastros.listarVendedores({ lojaId: lojaId || undefined, incluirInativos: todos === '1' });
  }

  // out/2026 — não existe POST /vendedores: o cadastro de vendedor é do
  // RovalConnecta. Quem tem cargo "Vendedor" lá chega por `vendedor.upsert`
  // (ver `modules/sync`), já com a loja e o histórico de lotação. Criar por
  // aqui abriria uma segunda porta para a mesma lista — alguém entraria na
  // cobertura do mês sem existir no hub e sem lotação replicada, e a
  // divergência só apareceria na conta de "x/6 avaliados".

  @Patch('vendedores/:id')
  @RequerPermissao(CADASTROS_GERENCIAR)
  editarVendedor(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(VendedorEditarSchema)) dto: VendedorEditar,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.cadastros.editarVendedor(id, dto, u);
  }

  /** Histórico de lotação do vendedor (loja por período). */
  @Get('vendedores/:id/lotacoes')
  @RequerAlguma(VENDEDORES_VER, CADASTROS_GERENCIAR)
  lotacoes(@Param('id', ParseUUIDPipe) id: string) {
    return this.lotacao.listar(id);
  }

  /** Transfere o vendedor de loja a partir de uma data (regra do FAC).
   *  Vendedor replicado do RovalConnecta é recusado aqui — a transferência
   *  dele é feita no hub (ver `LotacaoService.assertLotacaoLocal`). */
  @Post('vendedores/:id/transferencias')
  @RequerPermissao(CADASTROS_GERENCIAR)
  transferir(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(TransferirSchema)) dto: Transferir,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.lotacao.transferir(id, dto, u);
  }

  /** Desfaz uma transferência (a primeira lotação não se exclui). */
  @Delete('lotacoes/:id')
  @RequerPermissao(CADASTROS_GERENCIAR)
  removerLotacao(@Param('id', ParseUUIDPipe) id: string, @UsuarioAtual() u: UsuarioAutenticado) {
    return this.lotacao.remover(id, u);
  }

  /** Lido por todas as telas (faixas e metas); só a administração altera. */
  @Get('parametros')
  parametros() {
    return this.cadastros.parametros();
  }

  @Put('parametros')
  @RequerPermissao(CADASTROS_GERENCIAR)
  salvarParametros(@Body(zodPipe(ParametrosSchema)) dto: ParametrosDto, @UsuarioAtual() u: UsuarioAutenticado) {
    return this.cadastros.salvarParametros(dto, u);
  }
}
