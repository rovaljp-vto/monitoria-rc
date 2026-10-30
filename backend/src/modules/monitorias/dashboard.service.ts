import { Injectable } from '@nestjs/common';
import { type CanalAtendimento, type Faixa, TipoModulo } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { arredondar2, faixaDaNota } from '../../common/nota/motor';
import { deslocarMes } from '../../common/tempo/mes';
import { CadastrosService } from '../cadastros/cadastros.service';
import { PainelService } from './painel.service';

export interface FiltroDashboard {
  ate: string; // AAAA-MM, último mês do período
  meses: number; // 1 (mês atual) | 3 | 6 | 12
  lojaId?: string;
  canal?: CanalAtendimento;
}

type Resp = 'SIM' | 'NAO' | 'NA';

interface Linha {
  id: string;
  mesRef: string;
  nota: number;
  faixa: Faixa;
  lojaId: string;
  alvoId: string;
  canal: CanalAtendimento | null;
  avaliador: string;
  respostas: { resposta: Resp; texto: string; ordem: number }[];
  autoavaliacoes: number[];
  temFeedback: boolean;
}

const FAIXAS: Faixa[] = ['EXCELENTE', 'BOM', 'REGULAR', 'CRITICO'];

const media = (xs: number[]) => (xs.length ? arredondar2(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
const pct = (a: number, b: number) => (b ? arredondar2((a / b) * 100) : null);

/** % de "Sim" entre as respostas aplicáveis (Sim + Não) — a conformidade do escopo. */
function conformidade(linhas: Linha[]) {
  let sim = 0;
  let aplicavel = 0;
  for (const l of linhas) for (const r of l.respostas) {
    if (r.resposta === 'NA') continue;
    aplicavel++;
    if (r.resposta === 'SIM') sim++;
  }
  return pct(sim, aplicavel);
}

/**
 * Dashboard analítico — escopo §4.4 (vendedores) e §4.5 (lojas).
 *
 * O que entra foi escolhido a partir do que painéis de monitoria de qualidade
 * de mercado mostram (contact center e auditoria de loja): nota única
 * decomposta nos comportamentos que a formam, tendência mês a mês, "quais
 * critérios mais falham", mapa de calor loja × critério, comparativo entre
 * lojas.
 *
 * Volume é baixo (~400 monitorias/ano): agrega em memória, numa ida ao banco.
 * As notas dos dois módulos nunca se misturam — tudo filtra por `tipo`.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly painel: PainelService,
    private readonly cadastros: CadastrosService,
  ) {}

  async montar(modulo: TipoModulo, f: FiltroDashboard) {
    const meses = Array.from({ length: f.meses }, (_, i) => deslocarMes(f.ate, i - f.meses + 1));
    const anteriores = meses.map((m) => deslocarMes(m, -f.meses));
    // Gráficos de tendência precisam de contexto: com período curto (ex.: só o
    // mês atual), a série mostra os últimos 6 meses até o mês escolhido.
    const mesesSerie = f.meses >= 6 ? meses : Array.from({ length: 6 }, (_, i) => deslocarMes(f.ate, i - 5));
    const parametros = await this.cadastros.parametros();

    const brutas = await this.prisma.monitoria.findMany({
      where: { tipo: modulo, retificadaPor: { is: null }, mesRef: { in: [...new Set([...anteriores, ...meses, ...mesesSerie])] } },
      select: {
        id: true,
        mesRef: true,
        nota: true,
        faixa: true,
        lojaId: true,
        vendedorId: true,
        canal: true,
        avaliador: { select: { nome: true } },
        respostas: { select: { resposta: true, pergunta: { select: { texto: true, ordem: true } } } },
        feedbacks: { select: { autoavaliacao: true } },
      },
    });
    const todas: Linha[] = brutas.map((m) => ({
      id: m.id,
      mesRef: m.mesRef,
      nota: Number(m.nota),
      faixa: m.faixa,
      lojaId: m.lojaId,
      alvoId: modulo === TipoModulo.VENDEDOR ? (m.vendedorId as string) : m.lojaId,
      canal: m.canal,
      avaliador: m.avaliador.nome,
      respostas: m.respostas.map((r) => ({ resposta: r.resposta, texto: r.pergunta.texto, ordem: r.pergunta.ordem })),
      autoavaliacoes: m.feedbacks.map((x) => x.autoavaliacao).filter((x): x is number => x !== null),
      temFeedback: m.feedbacks.length > 0,
    }));

    // Filtros do topo. Como no Power BI, o visual que DEFINE o filtro continua
    // mostrando o todo, com o selecionado em destaque: o comparativo de lojas
    // ignora o filtro de loja, e o de canais ignora o filtro de canal.
    const porLoja = (l: Linha) => !f.lojaId || l.lojaId === f.lojaId;
    const porCanal = (l: Linha) => !f.canal || l.canal === f.canal;
    const noPeriodo = new Set(meses);
    const atual = todas.filter((l) => noPeriodo.has(l.mesRef) && porLoja(l) && porCanal(l));
    const noAnterior = new Set(anteriores);
    const antes = todas.filter((l) => noAnterior.has(l.mesRef) && porLoja(l) && porCanal(l));
    const daSerie = todas.filter((l) => mesesSerie.includes(l.mesRef) && porLoja(l) && porCanal(l));

    const coberturas = await Promise.all(
      [...meses, deslocarMes(meses[0], -1)].map((m) => this.painel.resumoCobertura(modulo, m, f.lojaId)),
    );
    const coberturaDoMes = (i: number) => pct(coberturas[i].avaliados, coberturas[i].total);

    const emFoco = (ls: Linha[]) => pct(ls.filter((l) => l.faixa === 'REGULAR' || l.faixa === 'CRITICO').length, ls.length);
    const comFeedback = (ls: Linha[]) => pct(ls.filter((l) => l.temFeedback).length, ls.length);

    // ── Indicadores (período × período anterior de mesmo tamanho) ────────────
    const gaps = atual.flatMap((l) => l.autoavaliacoes.map((a) => (a - l.nota) / 10));
    const kpis = {
      notaMedia: { atual: media(atual.map((l) => l.nota)), anterior: media(antes.map((l) => l.nota)) },
      conformidade: { atual: conformidade(atual), anterior: conformidade(antes) },
      monitorias: { atual: atual.length, anterior: antes.length },
      cobertura: { atual: coberturaDoMes(meses.length - 1), anterior: coberturaDoMes(meses.length - 2 >= 0 ? meses.length - 2 : meses.length) },
      emFoco: { atual: emFoco(atual), anterior: emFoco(antes) },
      feedback: { atual: comFeedback(atual), anterior: comFeedback(antes) },
      autoavaliacao: { diferencaMedia: media(gaps), feedbacks: gaps.length, acima: gaps.filter((g) => g > 0.5).length, abaixo: gaps.filter((g) => g < -0.5).length },
    };

    // ── Série mensal ─────────────────────────────────────────────────────────
    const coberturasSerie = await Promise.all(mesesSerie.map((m) => this.painel.resumoCobertura(modulo, m, f.lojaId)));
    const serie = mesesSerie.map((mes, i) => {
      const doMes = daSerie.filter((l) => l.mesRef === mes);
      const faixas = Object.fromEntries(FAIXAS.map((fx) => [fx, doMes.filter((l) => l.faixa === fx).length])) as Record<Faixa, number>;
      return { mes, monitorias: doMes.length, notaMedia: media(doMes.map((l) => l.nota)), conformidade: conformidade(doMes), cobertura: pct(coberturasSerie[i].avaliados, coberturasSerie[i].total), faixas };
    });

    // ── Critérios (agrupados pelo TEXTO: sobrevivem a uma versão que só mudou pesos) ──
    const criterios = new Map<string, { ordem: number; sim: number; aplic: number; mes: Map<string, [number, number]> }>();
    for (const l of atual) for (const r of l.respostas) {
      const c = criterios.get(r.texto) ?? { ordem: r.ordem, sim: 0, aplic: 0, mes: new Map() };
      if (r.resposta !== 'NA') {
        c.aplic++;
        if (r.resposta === 'SIM') c.sim++;
      }
      criterios.set(r.texto, c);
    }
    for (const l of daSerie) for (const r of l.respostas) {
      const c = criterios.get(r.texto) ?? { ordem: r.ordem, sim: 0, aplic: 0, mes: new Map() };
      if (r.resposta !== 'NA') {
        const m = c.mes.get(l.mesRef) ?? [0, 0];
        m[1]++;
        if (r.resposta === 'SIM') m[0]++;
        c.mes.set(l.mesRef, m);
      }
      criterios.set(r.texto, c);
    }
    const listaCriterios = [...criterios.entries()]
      .sort(([, a], [, b]) => a.ordem - b.ordem)
      .map(([criterio, c]) => ({
        criterio,
        pctSim: pct(c.sim, c.aplic),
        aplicavel: c.aplic,
        porMes: Object.fromEntries(mesesSerie.map((m) => [m, c.mes.has(m) ? pct(c.mes.get(m)![0], c.mes.get(m)![1]) : null])),
      }));

    // ── Lojas (ignora o filtro de loja) ──────────────────────────────────────
    const lojasCad = await this.prisma.loja.findMany({ orderBy: [{ ordem: 'asc' }, { nome: 'asc' }], select: { id: true, nome: true, ativa: true } });
    const doPeriodoSemLoja = todas.filter((l) => noPeriodo.has(l.mesRef) && porCanal(l));
    const coberturaTodas = await this.painel.resumoCobertura(modulo, meses[meses.length - 1]);
    const lojas = lojasCad
      .map((loja) => {
        const ls = doPeriodoSemLoja.filter((l) => l.lojaId === loja.id);
        const cob = coberturaTodas.porLoja[loja.id];
        return {
          lojaId: loja.id,
          nome: loja.nome,
          monitorias: ls.length,
          notaMedia: media(ls.map((l) => l.nota)),
          conformidade: conformidade(ls),
          cobertura: cob ? pct(cob.avaliados, cob.total) : null,
          porMes: Object.fromEntries(meses.map((m) => [m, media(ls.filter((l) => l.mesRef === m).map((l) => l.nota))])),
        };
      })
      .filter((l) => l.monitorias > 0 || lojasCad.find((x) => x.id === l.lojaId)?.ativa);

    // ── Ranking de vendedores / lojas ────────────────────────────────────────
    const nomes =
      modulo === TipoModulo.VENDEDOR
        ? await this.prisma.vendedor.findMany({ select: { id: true, nome: true, loja: { select: { nome: true } } } })
        : lojasCad.map((l) => ({ id: l.id, nome: l.nome, loja: { nome: l.nome } }));
    const nomePorId = new Map(nomes.map((n) => [n.id, n]));
    const alvosComNota = new Set(atual.map((l) => l.alvoId));
    const ranking = [...alvosComNota]
      .map((id) => {
        const ls = atual.filter((l) => l.alvoId === id);
        const nota = media(ls.map((l) => l.nota)) as number;
        return {
          id,
          nome: nomePorId.get(id)?.nome ?? '—',
          lojaNome: nomePorId.get(id)?.loja.nome ?? '',
          monitorias: ls.length,
          notaMedia: nota,
          faixa: faixaDaNota(nota, parametros),
          anterior: media(antes.filter((l) => l.alvoId === id).map((l) => l.nota)),
          serie: meses.map((m) => media(ls.filter((l) => l.mesRef === m).map((l) => l.nota))),
        };
      })
      .sort((a, b) => b.notaMedia - a.notaMedia);

    return {
      periodo: { meses, mesesSerie, anterior: { de: anteriores[0], ate: anteriores[anteriores.length - 1] } },
      limites: { excelenteMin: parametros.excelenteMin, bomMin: parametros.bomMin, regularMin: parametros.regularMin },
      kpis,
      serie,
      criterios: listaCriterios,
      lojas,
      ranking,
    };
  }
}
