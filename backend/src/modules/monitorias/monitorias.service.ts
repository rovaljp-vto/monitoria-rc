import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TipoModulo, type Pergunta } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { APP_CONFIG, type AppConfig } from '../../common/config/app-config';
import { calcularNota, type Resposta } from '../../common/nota/motor';
import { dataLocal, mesDe } from '../../common/tempo/mes';
import { identificarImagem, LIMITE_IMAGEM_BYTES, MAX_IMAGENS_POR_OBSERVACAO } from '../../common/arquivos/imagem';
import { exigirRegistrar, exigirVer, podeRegistrar } from '../../common/acesso/modulo';
import type { UsuarioAutenticado } from '../../common/guards/session.guard';
import { AuditService } from '../audit/audit.service';
import { CadastrosService } from '../cadastros/cadastros.service';
import { LotacaoService } from '../cadastros/lotacao.service';
import type { FeedbackDto, Listar, Registrar, Retificar } from './monitorias.schemas';

const POR_PAGINA = 30;

/** Imagens chegam logo após a observação; passado isto, só numa observação nova. */
const JANELA_IMAGENS_MS = 30 * 60_000;

/** Tolerância para relógio de máquina adiantado ao registrar "agora". */
const FOLGA_FUTURO_MS = 5 * 60_000;

@Injectable()
export class MonitoriasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cadastros: CadastrosService,
    private readonly lotacao: LotacaoService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Registro — escopo §4.1 / §4.5.
   *
   * A nota é calculada AQUI, com o mesmo motor da prévia da tela, e congelada
   * junto com a versão do checklist (regra 2). O que o cliente manda são só as
   * respostas; nota e faixa enviadas pelo navegador não existiriam no schema.
   */
  async registrar(modulo: TipoModulo, dto: Registrar, usuario: UsuarioAutenticado) {
    exigirRegistrar(usuario, modulo);

    const versao = await this.prisma.checklistVersao.findFirst({
      where: { ativa: true, checklist: { tipo: modulo } },
      include: { perguntas: true },
    });
    if (!versao) throw new NotFoundException('Nenhum checklist vigente para este módulo.');
    if (versao.id !== dto.versaoId) {
      throw new ConflictException(
        'O checklist foi atualizado enquanto você preenchia. Recarregue o formulário — as perguntas ou os pesos mudaram.',
      );
    }

    const { data, resultado, vendedorId } = await this.montarRegistro(modulo, dto, usuario, versao);
    const monitoria = await this.prisma.monitoria.create({
      data,
      select: { id: true, nota: true, faixa: true, mesRef: true, observacoes: { select: { id: true } } },
    });

    await this.audit.registrar({
      acao: 'monitoria.registrar',
      atorId: usuario.id,
      atorNome: usuario.nome,
      alvo: monitoria.id,
      metadata: { tipo: modulo, vendedorId, lojaId: dto.lojaId, nota: resultado.nota, faixa: resultado.faixa },
    });

    const { observacoes, ...resto } = monitoria;
    // O frontend usa o id para enviar as imagens da observação logo em seguida.
    return { ...resto, nota: Number(monitoria.nota), observacaoId: observacoes[0]?.id ?? null };
  }

  /**
   * Retificação (Fase 2) — edita uma monitoria finalizada criando OUTRA com as
   * correções e um motivo obrigatório. A original não é tocada (as trilhas são
   * imutáveis): ela sai das estatísticas porque a retificação aponta para ela.
   * Usa a MESMA versão do checklist da original — o atendimento aconteceu sob
   * aqueles critérios; mudar as respostas não muda as perguntas.
   */
  async retificar(id: string, dto: Retificar, usuario: UsuarioAutenticado) {
    const original = await this.prisma.monitoria.findUnique({
      where: { id },
      select: {
        id: true,
        tipo: true,
        versaoId: true,
        nota: true,
        retificadaPor: { select: { id: true } },
        versao: { include: { perguntas: true } },
      },
    });
    if (!original) throw new NotFoundException('Monitoria não encontrada.');
    exigirRegistrar(usuario, original.tipo);
    if (original.retificadaPor) {
      throw new ConflictException('Esta monitoria já foi retificada. Abra a versão vigente e edite a partir dela.');
    }
    if (dto.versaoId !== original.versaoId) {
      throw new BadRequestException('A retificação usa a mesma versão do checklist da monitoria original. Recarregue o formulário.');
    }

    const { data, resultado, vendedorId } = await this.montarRegistro(original.tipo, dto, usuario, original.versao);

    let monitoria;
    try {
      monitoria = await this.prisma.monitoria.create({
        data: { ...data, retificaDeId: original.id, motivoRetificacao: dto.motivo },
        select: { id: true, nota: true, faixa: true, mesRef: true, observacoes: { select: { id: true } } },
      });
    } catch (e) {
      // Índice único em retifica_de_id: duas pessoas editando ao mesmo tempo.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Outra pessoa acabou de retificar esta monitoria. Recarregue e confira a versão vigente.');
      }
      throw e;
    }

    await this.audit.registrar({
      acao: 'monitoria.retificar',
      atorId: usuario.id,
      atorNome: usuario.nome,
      alvo: monitoria.id,
      metadata: {
        retificaDe: original.id,
        motivo: dto.motivo,
        tipo: original.tipo,
        vendedorId,
        lojaId: dto.lojaId,
        notaAnterior: Number(original.nota),
        notaNova: resultado.nota,
        faixa: resultado.faixa,
      },
    });

    const { observacoes, ...resto } = monitoria;
    return { ...resto, nota: Number(monitoria.nota), observacaoId: observacoes[0]?.id ?? null };
  }

  /**
   * Tudo que o formulário de retificação precisa: a versão do checklist DA
   * monitoria (não a vigente) e as respostas atuais para pré-preencher.
   */
  async formularioRetificacao(id: string, usuario: UsuarioAutenticado) {
    const m = await this.prisma.monitoria.findUnique({
      where: { id },
      select: {
        id: true,
        tipo: true,
        lojaId: true,
        vendedorId: true,
        canal: true,
        dataReferencia: true,
        retificadaPor: { select: { id: true } },
        versao: {
          select: {
            id: true,
            numero: true,
            checklist: { select: { nome: true, tipo: true } },
            perguntas: {
              orderBy: { ordem: 'asc' },
              select: { id: true, texto: true, descricao: true, tipoResposta: true, peso: true, ordem: true, mensagemSim: true, mensagemNao: true },
            },
          },
        },
        respostas: { select: { perguntaId: true, resposta: true, observacao: true } },
      },
    });
    if (!m) throw new NotFoundException('Monitoria não encontrada.');
    exigirRegistrar(usuario, m.tipo);
    if (m.retificadaPor) {
      throw new ConflictException('Esta monitoria já foi retificada. Abra a versão vigente e edite a partir dela.');
    }
    return {
      id: m.id,
      tipo: m.tipo,
      lojaId: m.lojaId,
      vendedorId: m.vendedorId,
      canal: m.canal,
      dataReferencia: m.dataReferencia,
      versao: m.versao,
      respostas: m.respostas,
    };
  }

  /** Validação do cabeçalho e das respostas + nota — comum ao registro e à retificação. */
  private async montarRegistro(
    modulo: TipoModulo,
    dto: Registrar,
    usuario: UsuarioAutenticado,
    versao: { id: string; perguntas: Pergunta[] },
  ) {
    const dataReferencia = new Date(dto.dataReferencia);
    if (dataReferencia.getTime() > Date.now() + FOLGA_FUTURO_MS) {
      throw new BadRequestException('A data do atendimento não pode estar no futuro.');
    }

    const loja = await this.prisma.loja.findUnique({ where: { id: dto.lojaId } });
    if (!loja) throw new BadRequestException('Loja não encontrada.');
    if (!loja.ativa) throw new BadRequestException(`A loja ${loja.nome} está inativa.`);

    let vendedorId: string | null = null;
    if (modulo === TipoModulo.VENDEDOR) {
      if (!dto.vendedorId) throw new BadRequestException('Vendedor(a) é obrigatório.');
      if (!dto.canal) throw new BadRequestException('Canal do atendimento é obrigatório.');
      const vendedor = await this.prisma.vendedor.findUnique({ where: { id: dto.vendedorId } });
      if (!vendedor) throw new BadRequestException('Vendedor(a) não encontrado(a).');
      if (!vendedor.ativo) throw new BadRequestException(`${vendedor.nome} está inativo(a).`);
      // A loja certa é a da LOTAÇÃO no dia do atendimento (transferências têm
      // data). Aceitar outra faria o "x/6 avaliados" de uma loja contar gente de outra.
      const dia = dataLocal(dataReferencia, this.config.timezone);
      const lojaDoDia = (await this.lotacao.lojaNaData(vendedor.id, dia)) ?? vendedor.lojaId;
      if (lojaDoDia !== loja.id) {
        const certa = await this.prisma.loja.findUnique({ where: { id: lojaDoDia }, select: { nome: true } });
        throw new BadRequestException(
          `Em ${dia.split('-').reverse().join('/')}, ${vendedor.nome} estava lotado(a) na loja ${certa?.nome ?? '—'}, não em ${loja.nome}.`,
        );
      }
      vendedorId = vendedor.id;
    } else if (dto.vendedorId || dto.canal) {
      throw new BadRequestException('Monitoria de loja não tem vendedor nem canal.');
    }

    const idsValidos = new Set(versao.perguntas.map((p) => p.id));
    const respostas: Record<string, Resposta> = {};
    const observacaoDoCriterio = new Map<string, string>();
    for (const r of dto.respostas) {
      if (!idsValidos.has(r.perguntaId)) {
        throw new BadRequestException('Uma das respostas não pertence ao checklist deste formulário.');
      }
      respostas[r.perguntaId] = r.resposta;
      if (r.observacao) observacaoDoCriterio.set(r.perguntaId, r.observacao);
    }

    const parametros = await this.cadastros.parametros();
    const resultado = calcularNota(versao.perguntas, respostas, parametros);
    if (!resultado.ok) throw new BadRequestException(resultado.erro);

    const data: Prisma.MonitoriaUncheckedCreateInput = {
      tipo: modulo,
      vendedorId,
      lojaId: loja.id,
      canal: modulo === TipoModulo.VENDEDOR ? dto.canal : null,
      dataReferencia,
      mesRef: mesDe(dataReferencia, this.config.timezone),
      avaliadorId: usuario.id,
      versaoId: versao.id,
      nota: new Prisma.Decimal(resultado.nota),
      faixa: resultado.faixa,
      respostas: {
        create: resultado.itens.map((i) => ({
          perguntaId: i.criterioId,
          resposta: i.resposta,
          pesoEfetivo: new Prisma.Decimal(i.pesoEfetivo.toFixed(4)),
          pontos: new Prisma.Decimal(i.pontos.toFixed(4)),
          observacao: observacaoDoCriterio.get(i.criterioId) ?? null,
        })),
      },
      ...(dto.observacao || dto.observacaoComImagens
        ? { observacoes: { create: { autorId: usuario.id, texto: dto.observacao ?? '' } } }
        : {}),
    };
    return { data, resultado, vendedorId };
  }

  async listar(modulo: TipoModulo, filtro: Listar, usuario: UsuarioAutenticado) {
    exigirVer(usuario, modulo);
    const where: Prisma.MonitoriaWhereInput = {
      tipo: modulo,
      // Monitoria retificada sai da lista: quem vale é a retificação.
      retificadaPor: { is: null },
      ...(filtro.mes ? { mesRef: filtro.mes } : {}),
      ...(filtro.lojaId ? { lojaId: filtro.lojaId } : {}),
      ...(filtro.vendedorId ? { vendedorId: filtro.vendedorId } : {}),
      ...(filtro.faixa ? { faixa: filtro.faixa } : {}),
    };

    const [total, itens] = await this.prisma.$transaction([
      this.prisma.monitoria.count({ where }),
      this.prisma.monitoria.findMany({
        where,
        orderBy: { dataReferencia: 'desc' },
        skip: (filtro.pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
        select: {
          id: true,
          dataReferencia: true,
          canal: true,
          nota: true,
          faixa: true,
          criadaEm: true,
          loja: { select: { id: true, nome: true } },
          vendedor: { select: { id: true, nome: true } },
          avaliador: { select: { nome: true } },
          _count: { select: { observacoes: true } },
        },
      }),
    ]);

    return {
      total,
      pagina: filtro.pagina,
      porPagina: POR_PAGINA,
      itens: itens.map((m) => ({ ...m, nota: Number(m.nota) })),
    };
  }

  async detalhe(id: string, usuario: UsuarioAutenticado) {
    const m = await this.prisma.monitoria.findUnique({
      where: { id },
      include: {
        loja: { select: { id: true, nome: true } },
        vendedor: { select: { id: true, nome: true } },
        avaliador: { select: { nome: true } },
        versao: { select: { numero: true } },
        retificadaPor: { select: { id: true, criadaEm: true, motivoRetificacao: true, avaliador: { select: { nome: true } } } },
        respostas: {
          include: { pergunta: { select: { texto: true, descricao: true, peso: true, ordem: true, mensagemSim: true, mensagemNao: true } } },
        },
        observacoes: {
          orderBy: { criadaEm: 'asc' },
          select: {
            id: true,
            texto: true,
            criadaEm: true,
            autor: { select: { nome: true } },
            // Só os ids: a imagem em si vem por GET /api/imagens/:id.
            imagens: { select: { id: true }, orderBy: { criadaEm: 'asc' } },
          },
        },
        feedbacks: {
          orderBy: { realizadoEm: 'asc' },
          select: {
            id: true,
            autoavaliacao: true,
            pontosFortes: true,
            pontosMelhorar: true,
            combinados: true,
            realizadoEm: true,
            autor: { select: { nome: true } },
            imagens: { select: { id: true }, orderBy: { criadaEm: 'asc' } },
          },
        },
      },
    });
    if (!m) throw new NotFoundException('Monitoria não encontrada.');
    exigirVer(usuario, m.tipo);

    return {
      id: m.id,
      tipo: m.tipo,
      loja: m.loja,
      vendedor: m.vendedor,
      canal: m.canal,
      dataReferencia: m.dataReferencia,
      mesRef: m.mesRef,
      criadaEm: m.criadaEm,
      avaliador: m.avaliador.nome,
      versaoChecklist: m.versao.numero,
      nota: Number(m.nota),
      faixa: m.faixa,
      respostas: m.respostas
        .sort((a, b) => a.pergunta.ordem - b.pergunta.ordem)
        .map((r) => ({
          pergunta: r.pergunta.texto,
          descricao: r.pergunta.descricao,
          pesoOriginal: r.pergunta.peso,
          pesoEfetivo: Number(r.pesoEfetivo),
          pontos: Number(r.pontos),
          resposta: r.resposta,
          observacao: r.observacao,
          // Mensagem ao avaliado conforme a resposta (definida no checklist).
          mensagem: r.resposta === 'SIM' ? r.pergunta.mensagemSim : r.resposta === 'NAO' ? r.pergunta.mensagemNao : null,
        })),
      observacoes: m.observacoes.map((o) => ({
        id: o.id,
        texto: o.texto,
        criadaEm: o.criadaEm,
        autor: o.autor.nome,
        imagens: o.imagens.map((i) => i.id),
      })),
      feedbacks: m.feedbacks.map(({ autor, imagens, ...f }) => ({ ...f, autor: autor.nome, imagens: imagens.map((i) => i.id) })),
      podeObservar: podeRegistrar(usuario, m.tipo),
      // Retificação: esta monitoria corrige outra (motivo) / foi corrigida por outra.
      retificacao: m.retificaDeId ? { originalId: m.retificaDeId, motivo: m.motivoRetificacao ?? '' } : null,
      retificadaPor: m.retificadaPor
        ? { id: m.retificadaPor.id, criadaEm: m.retificadaPor.criadaEm, avaliador: m.retificadaPor.avaliador.nome }
        : null,
      podeRetificar: podeRegistrar(usuario, m.tipo) && !m.retificadaPor,
    };
  }

  /**
   * Regra 7 — observação só se ACRESCENTA. Não há rota de edição nem de
   * exclusão, e a migration tem trigger que recusa UPDATE/DELETE na tabela.
   */
  async observar(monitoriaId: string, texto: string, usuario: UsuarioAutenticado) {
    const m = await this.prisma.monitoria.findUnique({ where: { id: monitoriaId }, select: { tipo: true } });
    if (!m) throw new NotFoundException('Monitoria não encontrada.');
    exigirRegistrar(usuario, m.tipo);

    const obs = await this.prisma.observacao.create({
      data: { monitoriaId, autorId: usuario.id, texto },
      select: { id: true, texto: true, criadaEm: true },
    });
    await this.audit.registrar({
      acao: 'monitoria.observacao',
      atorId: usuario.id,
      atorNome: usuario.nome,
      alvo: monitoriaId,
    });
    return { ...obs, autor: usuario.nome };
  }

  /**
   * Imagens da observação (prints de conversa, fotos).
   *
   * A observação é imutável depois de registrada; as imagens chegam numa
   * segunda requisição logo após ela nascer. Por isso só quem ESCREVEU a
   * observação pode anexar, e só nos primeiros minutos — depois disso, uma
   * imagem nova vira uma observação nova, como qualquer complemento.
   */
  async enviarImagens(observacaoId: string, arquivos: Express.Multer.File[], usuario: UsuarioAutenticado) {
    const obs = await this.prisma.observacao.findUnique({
      where: { id: observacaoId },
      select: { autorId: true, criadaEm: true, monitoriaId: true, monitoria: { select: { tipo: true } }, _count: { select: { imagens: true } } },
    });
    if (!obs) throw new NotFoundException('Observação não encontrada.');
    exigirRegistrar(usuario, obs.monitoria.tipo);
    if (obs.autorId !== usuario.id) throw new ForbiddenException('Só quem escreveu a observação pode anexar imagens a ela.');
    if (Date.now() - obs.criadaEm.getTime() > JANELA_IMAGENS_MS) {
      throw new ForbiddenException('O prazo para anexar imagens a esta observação passou. Adicione uma nova observação com as imagens.');
    }
    if (!arquivos.length) throw new BadRequestException('Nenhuma imagem recebida.');
    if (obs._count.imagens + arquivos.length > MAX_IMAGENS_POR_OBSERVACAO) {
      throw new BadRequestException(`Cada observação aceita até ${MAX_IMAGENS_POR_OBSERVACAO} imagens.`);
    }

    const criadas = await this.gravarImagens(arquivos, { observacaoId });
    await this.audit.registrar({
      acao: 'monitoria.observacao.imagens',
      atorId: usuario.id,
      atorNome: usuario.nome,
      alvo: obs.monitoriaId,
      metadata: { observacaoId, quantidade: criadas.length },
    });
    return { imagens: criadas.map((c) => c.id) };
  }

  /** Imagens do feedback — mesmas regras das da observação (autor, prazo, limite). */
  async enviarImagensFeedback(feedbackId: string, arquivos: Express.Multer.File[], usuario: UsuarioAutenticado) {
    const fb = await this.prisma.feedback.findUnique({
      where: { id: feedbackId },
      select: { autorId: true, realizadoEm: true, monitoriaId: true, monitoria: { select: { tipo: true } }, _count: { select: { imagens: true } } },
    });
    if (!fb) throw new NotFoundException('Feedback não encontrado.');
    exigirRegistrar(usuario, fb.monitoria.tipo);
    if (fb.autorId !== usuario.id) throw new ForbiddenException('Só quem registrou o feedback pode anexar imagens a ele.');
    if (Date.now() - fb.realizadoEm.getTime() > JANELA_IMAGENS_MS) {
      throw new ForbiddenException('O prazo para anexar imagens a este feedback passou. Adicione as imagens numa observação da monitoria.');
    }
    if (!arquivos.length) throw new BadRequestException('Nenhuma imagem recebida.');
    if (fb._count.imagens + arquivos.length > MAX_IMAGENS_POR_OBSERVACAO) {
      throw new BadRequestException(`Cada feedback aceita até ${MAX_IMAGENS_POR_OBSERVACAO} imagens.`);
    }
    const criadas = await this.gravarImagens(arquivos, { feedbackId });
    await this.audit.registrar({
      acao: 'monitoria.feedback.imagens',
      atorId: usuario.id,
      atorNome: usuario.nome,
      alvo: fb.monitoriaId,
      metadata: { feedbackId, quantidade: criadas.length },
    });
    return { imagens: criadas.map((c) => c.id) };
  }

  /** Tudo validado ANTES de gravar qualquer coisa: ou entram todas, ou nenhuma. */
  private gravarImagens(arquivos: Express.Multer.File[], dono: { observacaoId: string } | { feedbackId: string }) {
    const validas = arquivos.map((a) => {
      if (a.size > LIMITE_IMAGEM_BYTES) throw new BadRequestException(`A imagem "${a.originalname}" passa de 8 MB.`);
      const mime = identificarImagem(a.buffer);
      if (!mime) throw new BadRequestException(`"${a.originalname}" não é uma imagem aceita (JPG, PNG, WebP ou GIF).`);
      return { ...dono, mime, tamanho: a.size, dados: new Uint8Array(a.buffer) };
    });
    return this.prisma.$transaction(validas.map((data) => this.prisma.imagemObservacao.create({ data, select: { id: true } })));
  }

  /** Conteúdo de uma imagem — quem pode ver o módulo da monitoria pode ver a imagem. */
  async imagem(id: string, usuario: UsuarioAutenticado) {
    const img = await this.prisma.imagemObservacao.findUnique({
      where: { id },
      select: {
        mime: true,
        tamanho: true,
        dados: true,
        observacao: { select: { monitoria: { select: { tipo: true } } } },
        feedback: { select: { monitoria: { select: { tipo: true } } } },
      },
    });
    const tipo = img?.observacao?.monitoria.tipo ?? img?.feedback?.monitoria.tipo;
    if (!img || !tipo) throw new NotFoundException('Imagem não encontrada.');
    exigirVer(usuario, tipo);
    return img;
  }

  /**
   * Feedback apresentado ao avaliado — pode acontecer dias depois da monitoria.
   * Guarda a nota que a pessoa se deu (autoavaliação) e o que foi combinado.
   * Como a observação, só se acrescenta: trigger recusa UPDATE/DELETE.
   */
  async registrarFeedback(monitoriaId: string, dto: FeedbackDto, usuario: UsuarioAutenticado) {
    const m = await this.prisma.monitoria.findUnique({ where: { id: monitoriaId }, select: { tipo: true } });
    if (!m) throw new NotFoundException('Monitoria não encontrada.');
    exigirRegistrar(usuario, m.tipo);
    if (m.tipo !== TipoModulo.VENDEDOR) {
      throw new BadRequestException('Feedback é só para monitoria de vendedor — loja não tem apresentação de feedback.');
    }

    const feedback = await this.prisma.feedback.create({
      data: {
        monitoriaId,
        autorId: usuario.id,
        autoavaliacao: dto.autoavaliacao ?? null,
        pontosFortes: dto.pontosFortes || null,
        pontosMelhorar: dto.pontosMelhorar || null,
        combinados: dto.combinados || null,
      },
    });
    await this.audit.registrar({
      acao: 'monitoria.feedback',
      atorId: usuario.id,
      atorNome: usuario.nome,
      alvo: monitoriaId,
      metadata: { autoavaliacao: dto.autoavaliacao ?? null },
    });
    return { ...feedback, autor: usuario.nome };
  }
}
