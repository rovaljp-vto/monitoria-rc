/**
 * Motor de nota — escopo §3.3 e §3.4, comum aos dois módulos.
 *
 * ⚠️ Este arquivo é importado TAMBÉM pelo frontend (prévia da nota ao vivo, antes
 * de salvar). Por isso não pode importar nada: nem Prisma, nem Nest, nem Node.
 * Uma só implementação garante que a nota que a pessoa vê na tela é exatamente
 * a que o servidor grava.
 *
 * Regras:
 *  - "Sim" soma o peso; "Não" soma 0.
 *  - "Não se aplica" tira o critério do cálculo e redistribui proporcionalmente
 *    os pesos restantes — a nota continua em 0–100.
 *  - Todos N/A → monitoria inválida (regra de negócio 3).
 *
 * Preparado para a escala 0–5 (§3.5): o cálculo trabalha com uma FRAÇÃO obtida
 * por critério (Sim = 1, Não = 0); uma escala nova só precisa mapear para 0–1.
 */

export type Resposta = 'SIM' | 'NAO' | 'NA';
export type TipoResposta = 'SIM_NAO' | 'SIM_NAO_NA';
export type Faixa = 'EXCELENTE' | 'BOM' | 'REGULAR' | 'CRITICO';

export interface CriterioMotor {
  id: string;
  peso: number;
  tipoResposta: TipoResposta;
}

export interface LimitesFaixa {
  excelenteMin: number;
  bomMin: number;
  regularMin: number;
}

export interface ItemCalculado {
  criterioId: string;
  resposta: Resposta;
  /** Peso após a redistribuição do N/A, somando 100 entre os aplicáveis. */
  pesoEfetivo: number;
  pontos: number;
}

export type ResultadoNota =
  | { ok: true; nota: number; faixa: Faixa; itens: ItemCalculado[] }
  | { ok: false; erro: string; faltando?: string[] };

export const LIMITES_PADRAO: LimitesFaixa = { excelenteMin: 90, bomMin: 75, regularMin: 60 };

const FRACAO: Record<Exclude<Resposta, 'NA'>, number> = { SIM: 1, NAO: 0 };

/** Arredonda em 2 casas sem o erro clássico de 1.005 → 1. */
export function arredondar2(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

export function faixaDaNota(nota: number, limites: LimitesFaixa = LIMITES_PADRAO): Faixa {
  if (nota >= limites.excelenteMin) return 'EXCELENTE';
  if (nota >= limites.bomMin) return 'BOM';
  if (nota >= limites.regularMin) return 'REGULAR';
  return 'CRITICO';
}

/** Valida um conjunto de pesos para ser salvo como versão de checklist. */
export function validarPesos(criterios: { peso: number }[]): string | null {
  if (criterios.length === 0) return 'O checklist precisa de pelo menos um critério.';
  if (criterios.some((c) => !Number.isInteger(c.peso) || c.peso <= 0)) {
    return 'Todo peso precisa ser um número inteiro maior que zero.';
  }
  const soma = criterios.reduce((s, c) => s + c.peso, 0);
  if (soma !== 100) return `Os pesos precisam somar 100 (hoje somam ${soma}).`;
  return null;
}

export function calcularNota(
  criterios: CriterioMotor[],
  respostas: Record<string, Resposta | undefined>,
  limites: LimitesFaixa = LIMITES_PADRAO,
): ResultadoNota {
  const faltando = criterios.filter((c) => !respostas[c.id]).map((c) => c.id);
  if (faltando.length) {
    return { ok: false, erro: 'Responda todos os critérios.', faltando };
  }

  for (const c of criterios) {
    if (respostas[c.id] === 'NA' && c.tipoResposta !== 'SIM_NAO_NA') {
      return { ok: false, erro: 'Um critério recebeu "Não se aplica" sem permitir essa resposta.' };
    }
  }

  const aplicaveis = criterios.filter((c) => respostas[c.id] !== 'NA');
  const pesoAplicavel = aplicaveis.reduce((s, c) => s + c.peso, 0);
  if (aplicaveis.length === 0 || pesoAplicavel <= 0) {
    return { ok: false, erro: 'Todos os critérios estão como "Não se aplica": a monitoria não tem o que avaliar.' };
  }

  const fator = 100 / pesoAplicavel;
  let total = 0;
  const itens: ItemCalculado[] = criterios.map((c) => {
    const resposta = respostas[c.id] as Resposta;
    if (resposta === 'NA') return { criterioId: c.id, resposta, pesoEfetivo: 0, pontos: 0 };
    const pesoEfetivo = c.peso * fator;
    const pontos = pesoEfetivo * FRACAO[resposta];
    total += pontos;
    return { criterioId: c.id, resposta, pesoEfetivo, pontos };
  });

  // Soma de floats pode dar 99.99999; o teto é 100 por definição.
  const nota = Math.min(100, arredondar2(total));
  return { ok: true, nota, faixa: faixaDaNota(nota, limites), itens };
}
