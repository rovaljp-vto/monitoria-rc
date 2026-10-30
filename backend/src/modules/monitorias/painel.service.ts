import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type Faixa, type Parametros, Prisma, TipoModulo } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { APP_CONFIG, type AppConfig } from '../../common/config/app-config';
import { arredondar2, faixaDaNota } from '../../common/nota/motor';
import { dataLocal, dataPura, diaDoMes, diasNoMes, fimDoMesUtc, inicioDoMesUtc, mesDe, ultimoDiaDoMes } from '../../common/tempo/mes';
import { CadastrosService } from '../cadastros/cadastros.service';

/** Quem deve ser avaliado no mês: um vendedor ou uma loja. */
interface Alvo {
  id: string;
  nome: string;
  lojaId: string;
  lojaNome: string;
}

interface Agregado {
  quantidade: number;
  soma: number;
  ultimaData: Date;
  ultimaNota: number;
  ultimaMonitoriaId: string;
}

const EM_FOCO: ReadonlySet<Faixa> = new Set<Faixa>(['REGULAR', 'CRITICO']);

/**
 * Painéis do mês — escopo §4.2 (cobertura) e §4.3 / §4.5 (foco).
 *
 * As notas dos dois módulos NUNCA se misturam (regra 1b): todo cálculo aqui
 * filtra por `tipo` antes de agregar.
 */
@Injectable()
export class PainelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cadastros: CadastrosService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  mesAtual(): string {
    return mesDe(new Date(), this.config.timezone);
  }

  async cobertura(modulo: TipoModulo, mesRef: string) {
    const parametros = await this.cadastros.parametros();
    const [alvos, agregados] = await Promise.all([this.alvos(modulo, mesRef), this.agregar(modulo, mesRef)]);
    const foco = await this.situacaoFoco(modulo, mesRef, alvos, agregados, parametros);

    const itens = alvos.map((a) => {
      const ag = agregados.get(a.id);
      const media = ag ? arredondar2(ag.soma / ag.quantidade) : null;
      const f = foco.get(a.id);
      return {
        id: a.id,
        nome: a.nome,
        lojaId: a.lojaId,
        lojaNome: a.lojaNome,
        avaliado: (ag?.quantidade ?? 0) >= parametros.metaBase,
        monitorias: ag?.quantidade ?? 0,
        mediaMes: media,
        faixaMes: media === null ? null : faixaDaNota(media, parametros),
        ultimaData: ag?.ultimaData ?? null,
        ultimaNota: ag?.ultimaNota ?? null,
        emFoco: Boolean(f),
        metaMes: f?.meta ?? parametros.metaBase,
      };
    });

    const avaliados = itens.filter((i) => i.avaliado).length;
    const comNota = itens.filter((i) => i.mediaMes !== null);
    const totalMonitorias = [...agregados.values()].reduce((s, a) => s + a.quantidade, 0);
    const somaNotas = [...agregados.values()].reduce((s, a) => s + a.soma, 0);

    const porFaixa: Record<Faixa, number> = { EXCELENTE: 0, BOM: 0, REGULAR: 0, CRITICO: 0 };
    for (const i of comNota) porFaixa[i.faixaMes as Faixa]++;

    // Agrupamento por loja: no módulo Vendedores é o "7/8 avaliados" do §4.2.
    const porLoja = new Map<string, { lojaId: string; lojaNome: string; total: number; avaliados: number }>();
    for (const i of itens) {
      const g = porLoja.get(i.lojaId) ?? { lojaId: i.lojaId, lojaNome: i.lojaNome, total: 0, avaliados: 0 };
      g.total++;
      if (i.avaliado) g.avaliados++;
      porLoja.set(i.lojaId, g);
    }

    const ehMesAtual = mesRef === this.mesAtual();
    const hoje = diaDoMes(new Date(), this.config.timezone);
    const pendentes = itens.length - avaliados;

    return {
      mes: mesRef,
      ehMesAtual,
      resumo: {
        total: itens.length,
        avaliados,
        pendentes,
        cobertura: itens.length ? arredondar2((avaliados / itens.length) * 100) : 0,
        monitorias: totalMonitorias,
        mediaGeral: totalMonitorias ? arredondar2(somaNotas / totalMonitorias) : null,
        porFaixa,
        emFoco: foco.size,
        diasRestantes: ehMesAtual ? diasNoMes(mesRef) - hoje : null,
        // §4.2 — pendências ganham destaque a partir do dia configurado.
        alertaFimDeMes: ehMesAtual && hoje >= parametros.diaAlertaFimMes && pendentes > 0,
        diaAlerta: parametros.diaAlertaFimMes,
      },
      porLoja: [...porLoja.values()],
      itens,
    };
  }

  /**
   * Lista de foco — §4.3 (vendedores) e §4.5 (lojas).
   *
   * Entra quem tem a MÉDIA DO MÊS em Regular/Crítico; sem monitoria no mês,
   * vale a ÚLTIMA NOTA anterior — é o que coloca em foco, já no dia 1º, quem
   * terminou o mês passado mal avaliado.
   */
  async foco(modulo: TipoModulo, mesRef: string) {
    const parametros = await this.cadastros.parametros();
    const [alvos, agregados] = await Promise.all([this.alvos(modulo, mesRef), this.agregar(modulo, mesRef)]);
    const foco = await this.situacaoFoco(modulo, mesRef, alvos, agregados, parametros);

    const porId = new Map(alvos.map((a) => [a.id, a]));
    const itens = [...foco.entries()].map(([id, f]) => {
      const a = porId.get(id) as Alvo;
      const realizadas = agregados.get(id)?.quantidade ?? 0;
      return {
        id,
        nome: a.nome,
        lojaNome: a.lojaNome,
        nota: f.nota,
        faixa: f.faixa,
        origem: f.origem,
        meta: f.meta,
        realizadas,
        faltam: Math.max(0, f.meta - realizadas),
      };
    });

    // Crítico primeiro, depois pior nota.
    itens.sort((x, y) => (x.faixa === y.faixa ? x.nota - y.nota : x.faixa === 'CRITICO' ? -1 : 1));
    return { mes: mesRef, metas: { regular: parametros.metaRegular, critico: parametros.metaCritico }, itens };
  }

  /** Histórico de um vendedor ou loja: monitorias, média por mês e % de Sim por critério. */
  async alvo(modulo: TipoModulo, id: string) {
    const cabecalho =
      modulo === TipoModulo.VENDEDOR
        ? await this.prisma.vendedor.findUnique({
            where: { id },
            select: { id: true, nome: true, ativo: true, admissao: true, loja: { select: { id: true, nome: true } } },
          })
        : await this.prisma.loja.findUnique({ where: { id }, select: { id: true, nome: true, ativa: true } });
    if (!cabecalho) throw new NotFoundException(modulo === TipoModulo.VENDEDOR ? 'Vendedor(a) não encontrado(a).' : 'Loja não encontrada.');

    const where: Prisma.MonitoriaWhereInput = {
      // Retificadas ficam fora: a retificação já conta no lugar delas.
      retificadaPor: { is: null },
      ...(modulo === TipoModulo.VENDEDOR ? { tipo: modulo, vendedorId: id } : { tipo: modulo, lojaId: id }),
    };

    const monitorias = await this.prisma.monitoria.findMany({
      where,
      orderBy: { dataReferencia: 'desc' },
      select: {
        id: true,
        dataReferencia: true,
        mesRef: true,
        canal: true,
        nota: true,
        faixa: true,
        avaliador: { select: { nome: true } },
        loja: { select: { nome: true } },
        respostas: { select: { resposta: true, pergunta: { select: { texto: true, ordem: true } } } },
      },
    });

    const parametros = await this.cadastros.parametros();
    const meses = new Map<string, { soma: number; qtd: number }>();
    // Agrupado pelo TEXTO do critério: sobrevive a uma nova versão do checklist
    // que só mudou pesos, e é o que responde "o problema é sempre o mesmo?".
    const criterios = new Map<string, { sim: number; aplicavel: number; ordem: number }>();

    for (const m of monitorias) {
      const g = meses.get(m.mesRef) ?? { soma: 0, qtd: 0 };
      g.soma += Number(m.nota);
      g.qtd++;
      meses.set(m.mesRef, g);
      for (const r of m.respostas) {
        const c = criterios.get(r.pergunta.texto) ?? { sim: 0, aplicavel: 0, ordem: r.pergunta.ordem };
        if (r.resposta !== 'NA') c.aplicavel++;
        if (r.resposta === 'SIM') c.sim++;
        criterios.set(r.pergunta.texto, c);
      }
    }

    return {
      alvo: cabecalho,
      porMes: [...meses.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mes, g]) => {
          const media = arredondar2(g.soma / g.qtd);
          return { mes, monitorias: g.qtd, media, faixa: faixaDaNota(media, parametros) };
        }),
      porCriterio: [...criterios.entries()]
        .sort(([, a], [, b]) => a.ordem - b.ordem)
        .map(([texto, c]) => ({
          criterio: texto,
          aplicavel: c.aplicavel,
          percentualSim: c.aplicavel ? arredondar2((c.sim / c.aplicavel) * 100) : null,
        })),
      monitorias: monitorias.map(({ respostas, ...m }) => ({
        ...m,
        nota: Number(m.nota),
        avaliador: m.avaliador.nome,
        loja: m.loja.nome,
        // Por critério (pelo texto): alimenta o "✓ ✓ ✗" da apresentação de feedback.
        respostas: respostas.map((r) => ({ criterio: r.pergunta.texto, resposta: r.resposta })),
      })),
    };
  }

  // ── Auxiliares ─────────────────────────────────────────────────────────────

  /**
   * Quem entra na cobertura do mês (regra 1 e regra 6):
   *  - já cadastrado até o fim do mês;
   *  - ativo, ou inativado DEPOIS do fim do mês. Quem foi inativado dentro do
   *    mês sai da cobertura daquele mês.
   */
  /** Cobertura enxuta de um mês — usada pela série do dashboard. */
  async resumoCobertura(modulo: TipoModulo, mesRef: string, lojaId?: string) {
    const [alvos, agregados] = await Promise.all([this.alvos(modulo, mesRef), this.agregar(modulo, mesRef)]);
    const doFiltro = lojaId ? alvos.filter((a) => a.lojaId === lojaId) : alvos;
    const avaliados = doFiltro.filter((a) => agregados.has(a.id)).length;
    return { total: doFiltro.length, avaliados, porLoja: alvos.reduce<Record<string, { total: number; avaliados: number }>>((acc, a) => {
      const g = (acc[a.lojaId] ??= { total: 0, avaliados: 0 });
      g.total++;
      if (agregados.has(a.id)) g.avaliados++;
      return acc;
    }, {}) };
  }

  private async alvos(modulo: TipoModulo, mesRef: string): Promise<Alvo[]> {
    const fim = fimDoMesUtc(mesRef);
    if (modulo === TipoModulo.VENDEDOR) {
      // Loja de cada vendedor NESTE mês = lotação vigente no último dia do mês
      // (ou hoje, no mês corrente). Transferência no meio do mês leva o
      // vendedor para a loja nova naquele mês; os meses anteriores não mudam.
      const hoje = dataLocal(new Date(), this.config.timezone);
      const ultimo = ultimoDiaDoMes(mesRef);
      const refDia = dataPura(ultimo < hoje ? ultimo : hoje);
      const inicioMes = dataPura(`${mesRef}-01`);
      const vendedores = await this.prisma.vendedor.findMany({
        where: {
          criadoEm: { lte: fim },
          OR: [{ ativo: true }, { inativadoEm: { gt: fim } }],
        },
        orderBy: { nome: 'asc' },
        select: {
          id: true,
          nome: true,
          loja: { select: { id: true, nome: true, ordem: true } },
          lotacoes: {
            // Períodos que tocam o mês; o mais recente até a data de referência vence.
            where: { dataInicio: { lte: refDia }, OR: [{ dataFim: null }, { dataFim: { gte: inicioMes } }] },
            orderBy: { dataInicio: 'desc' },
            take: 1,
            select: { loja: { select: { id: true, nome: true, ordem: true } } },
          },
        },
      });
      return vendedores
        .map((v) => ({ v, loja: v.lotacoes[0]?.loja ?? v.loja }))
        .sort((a, b) => a.loja.ordem - b.loja.ordem || a.loja.nome.localeCompare(b.loja.nome))
        .map(({ v, loja }) => ({ id: v.id, nome: v.nome, lojaId: loja.id, lojaNome: loja.nome }));
    }
    const lojas = await this.prisma.loja.findMany({
      where: { criadaEm: { lte: fim }, OR: [{ ativa: true }, { inativadaEm: { gt: fim } }] },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
      select: { id: true, nome: true },
    });
    return lojas.map((l) => ({ id: l.id, nome: l.nome, lojaId: l.id, lojaNome: l.nome }));
  }

  /** Monitorias do mês agregadas por alvo (vendedor ou loja). */
  private async agregar(modulo: TipoModulo, mesRef: string): Promise<Map<string, Agregado>> {
    const monitorias = await this.prisma.monitoria.findMany({
      where: { tipo: modulo, mesRef, retificadaPor: { is: null } },
      orderBy: { dataReferencia: 'asc' },
      select: { id: true, vendedorId: true, lojaId: true, nota: true, dataReferencia: true },
    });
    const mapa = new Map<string, Agregado>();
    for (const m of monitorias) {
      const chave = modulo === TipoModulo.VENDEDOR ? (m.vendedorId as string) : m.lojaId;
      const nota = Number(m.nota);
      const g = mapa.get(chave);
      if (g) {
        g.quantidade++;
        g.soma += nota;
        g.ultimaData = m.dataReferencia;
        g.ultimaNota = nota;
        g.ultimaMonitoriaId = m.id;
      } else {
        mapa.set(chave, { quantidade: 1, soma: nota, ultimaData: m.dataReferencia, ultimaNota: nota, ultimaMonitoriaId: m.id });
      }
    }
    return mapa;
  }

  private async situacaoFoco(
    modulo: TipoModulo,
    mesRef: string,
    alvos: Alvo[],
    agregados: Map<string, Agregado>,
    parametros: Parametros,
  ) {
    // Última nota ANTERIOR ao mês, só para quem ainda não foi avaliado nele.
    const semNotaNoMes = alvos.filter((a) => !agregados.has(a.id)).map((a) => a.id);
    const anteriores = new Map<string, number>();
    if (semNotaNoMes.length) {
      const campo = modulo === TipoModulo.VENDEDOR ? 'vendedor_id' : 'loja_id';
      // DISTINCT ON pega a mais recente de cada alvo numa ida ao banco.
      const linhas = await this.prisma.$queryRaw<{ alvo: string; nota: Prisma.Decimal }[]>`
        SELECT DISTINCT ON (${Prisma.raw(campo)}) ${Prisma.raw(campo)} AS alvo, nota
        FROM monitorias m
        WHERE tipo = ${modulo}::"TipoModulo"
          AND data_referencia < ${inicioDoMesUtc(mesRef)}
          AND ${Prisma.raw(campo)} IN (${Prisma.join(semNotaNoMes)})
          AND NOT EXISTS (SELECT 1 FROM monitorias r WHERE r.retifica_de_id = m.id)
        ORDER BY ${Prisma.raw(campo)}, data_referencia DESC`;
      for (const l of linhas) anteriores.set(l.alvo, Number(l.nota));
    }

    const foco = new Map<string, { nota: number; faixa: Faixa; origem: 'MES' | 'ANTERIOR'; meta: number }>();
    for (const a of alvos) {
      const ag = agregados.get(a.id);
      const nota = ag ? arredondar2(ag.soma / ag.quantidade) : anteriores.get(a.id);
      if (nota === undefined) continue;
      const faixa = faixaDaNota(nota, parametros);
      if (!EM_FOCO.has(faixa)) continue;
      foco.set(a.id, {
        nota,
        faixa,
        origem: ag ? 'MES' : 'ANTERIOR',
        meta: faixa === 'CRITICO' ? parametros.metaCritico : parametros.metaRegular,
      });
    }
    return foco;
  }
}
