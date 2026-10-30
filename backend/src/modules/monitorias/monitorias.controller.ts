import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { LIMITE_IMAGEM_BYTES, MAX_IMAGENS_POR_OBSERVACAO } from '../../common/arquivos/imagem';
import { UsuarioAtual } from '../../common/decorators';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { exigirVer, moduloDoSlug } from '../../common/acesso/modulo';
import { FORMATO_MES } from '../../common/tempo/mes';
import type { UsuarioAutenticado } from '../../common/guards/session.guard';
import { MonitoriasService } from './monitorias.service';
import { PainelService } from './painel.service';
import { DashboardService } from './dashboard.service';
import {
  FeedbackSchema,
  ListarSchema,
  ObservacaoSchema,
  RegistrarSchema,
  RetificarSchema,
  type FeedbackDto,
  type Listar,
  type ObservacaoDto,
  type Registrar,
  type Retificar,
} from './monitorias.schemas';

/**
 * Rotas dos dois módulos. O módulo vem na URL (`vendedores` | `lojas`) e decide
 * a permissão exigida — ver common/acesso/modulo.ts.
 */
@Controller('api')
export class MonitoriasController {
  constructor(
    private readonly monitorias: MonitoriasService,
    private readonly painel: PainelService,
    private readonly dashboard_: DashboardService,
  ) {}

  @Post('modulos/:modulo/monitorias')
  registrar(
    @Param('modulo') slug: string,
    @Body(zodPipe(RegistrarSchema)) dto: Registrar,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.monitorias.registrar(moduloDoSlug(slug), dto, u);
  }

  @Get('modulos/:modulo/monitorias')
  listar(
    @Param('modulo') slug: string,
    @Query(zodPipe(ListarSchema)) filtro: Listar,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.monitorias.listar(moduloDoSlug(slug), filtro, u);
  }

  @Get('modulos/:modulo/cobertura')
  cobertura(@Param('modulo') slug: string, @Query('mes') mes: string | undefined, @UsuarioAtual() u: UsuarioAutenticado) {
    const modulo = moduloDoSlug(slug);
    exigirVer(u, modulo);
    return this.painel.cobertura(modulo, this.mes(mes));
  }

  @Get('modulos/:modulo/foco')
  foco(@Param('modulo') slug: string, @Query('mes') mes: string | undefined, @UsuarioAtual() u: UsuarioAutenticado) {
    const modulo = moduloDoSlug(slug);
    exigirVer(u, modulo);
    return this.painel.foco(modulo, this.mes(mes));
  }

  /**
   * Dashboard analítico do módulo. `ate` = último mês do período (AAAA-MM),
   * `meses` = 1 (só o mês), 3, 6 ou 12. Filtros opcionais de loja e canal.
   */
  @Get('modulos/:modulo/dashboard')
  dashboard(
    @Param('modulo') slug: string,
    @Query('ate') ate: string | undefined,
    @Query('meses') meses: string | undefined,
    @Query('lojaId') lojaId: string | undefined,
    @Query('canal') canal: string | undefined,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    const modulo = moduloDoSlug(slug);
    exigirVer(u, modulo);
    const n = Number(meses ?? 1);
    if (![1, 3, 6, 12].includes(n)) throw new BadRequestException('Período: 1, 3, 6 ou 12 meses.');
    if (lojaId && !/^[0-9a-f-]{36}$/i.test(lojaId)) throw new BadRequestException('Loja inválida.');
    if (canal && !['BALCAO', 'WHATSAPP'].includes(canal)) throw new BadRequestException('Canal inválido.');
    return this.dashboard_.montar(modulo, {
      ate: this.mes(ate),
      meses: n,
      lojaId: lojaId || undefined,
      canal: (canal as 'BALCAO' | 'WHATSAPP') || undefined,
    });
  }

  /** Histórico de um vendedor (módulo vendedores) ou de uma loja (módulo lojas). */
  @Get('modulos/:modulo/alvos/:id')
  alvo(
    @Param('modulo') slug: string,
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    const modulo = moduloDoSlug(slug);
    exigirVer(u, modulo);
    return this.painel.alvo(modulo, id);
  }

  @Get('monitorias/:id')
  detalhe(@Param('id', ParseUUIDPipe) id: string, @UsuarioAtual() u: UsuarioAutenticado) {
    return this.monitorias.detalhe(id, u);
  }

  /** Dados para o formulário de edição (retificação): versão original + respostas atuais. */
  @Get('monitorias/:id/retificacao')
  formularioRetificacao(@Param('id', ParseUUIDPipe) id: string, @UsuarioAtual() u: UsuarioAutenticado) {
    return this.monitorias.formularioRetificacao(id, u);
  }

  /** Edita uma monitoria finalizada: cria a retificação com motivo obrigatório. */
  @Post('monitorias/:id/retificar')
  retificar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(RetificarSchema)) dto: Retificar,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.monitorias.retificar(id, dto, u);
  }

  @Post('monitorias/:id/observacoes')
  observar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(ObservacaoSchema)) dto: ObservacaoDto,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.monitorias.observar(id, dto.texto, u);
  }

  /**
   * Imagens de uma observação — `multipart/form-data`, campo `imagens`.
   * Ficam em memória até passar pela validação; nada é gravado antes disso.
   */
  @Post('observacoes/:id/imagens')
  @UseInterceptors(
    FilesInterceptor('imagens', MAX_IMAGENS_POR_OBSERVACAO, {
      defParamCharset: 'utf8',
      limits: { fileSize: LIMITE_IMAGEM_BYTES, files: MAX_IMAGENS_POR_OBSERVACAO, fields: 0 },
    }),
  )
  enviarImagens(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() arquivos: Express.Multer.File[] | undefined,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.monitorias.enviarImagens(id, arquivos ?? [], u);
  }

  /** Imagens do feedback — mesmo formato das da observação. */
  @Post('feedbacks/:id/imagens')
  @UseInterceptors(
    FilesInterceptor('imagens', MAX_IMAGENS_POR_OBSERVACAO, {
      defParamCharset: 'utf8',
      limits: { fileSize: LIMITE_IMAGEM_BYTES, files: MAX_IMAGENS_POR_OBSERVACAO, fields: 0 },
    }),
  )
  enviarImagensFeedback(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() arquivos: Express.Multer.File[] | undefined,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.monitorias.enviarImagensFeedback(id, arquivos ?? [], u);
  }

  /**
   * Serve a imagem para o <img>. O tipo enviado é o CONFERIDO no upload, com
   * `nosniff`: o navegador não tem como reinterpretar como outra coisa.
   * Conteúdo imutável (trigger) — pode ficar em cache privado.
   */
  @Get('imagens/:id')
  async imagem(@Param('id', ParseUUIDPipe) id: string, @UsuarioAtual() u: UsuarioAutenticado, @Res() res: Response) {
    const img = await this.monitorias.imagem(id, u);
    res.setHeader('Content-Type', img.mime);
    res.setHeader('Content-Length', img.tamanho);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
    res.end(Buffer.from(img.dados));
  }

  @Post('monitorias/:id/feedbacks')
  feedback(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(FeedbackSchema)) dto: FeedbackDto,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.monitorias.registrarFeedback(id, dto, u);
  }

  private mes(mes: string | undefined): string {
    if (!mes) return this.painel.mesAtual();
    if (!FORMATO_MES.test(mes)) throw new BadRequestException('Mês no formato AAAA-MM.');
    return mes;
  }
}
