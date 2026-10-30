/**
 * Mês de referência da cobertura ("AAAA-MM") no fuso da empresa.
 *
 * A cobertura é por mês-CALENDÁRIO local (regra 1): um atendimento às 22h do
 * dia 31 em São Paulo já é dia 1º em UTC, e contaria no mês errado se o corte
 * fosse feito em UTC.
 */

export const FORMATO_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

function partes(data: Date, timezone: string): { ano: number; mes: number; dia: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(data).map((x) => [x.type, x.value]));
  return { ano: Number(p.year), mes: Number(p.month), dia: Number(p.day) };
}

export function mesDe(data: Date, timezone: string): string {
  const { ano, mes } = partes(data, timezone);
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

export function diaDoMes(data: Date, timezone: string): number {
  return partes(data, timezone).dia;
}

/** Data local "AAAA-MM-DD" (no fuso da empresa) de um instante. */
export function dataLocal(data: Date, timezone: string): string {
  const { ano, mes, dia } = partes(data, timezone);
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** "AAAA-MM-DD" → Date à meia-noite UTC (formato das colunas @db.Date). */
export function dataPura(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Date de coluna @db.Date → "AAAA-MM-DD". */
export function isoDaDataPura(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function diaAnterior(iso: string): string {
  return isoDaDataPura(new Date(dataPura(iso).getTime() - 86_400_000));
}

/** Último dia do mês "AAAA-MM" como "AAAA-MM-DD". */
export function ultimoDiaDoMes(mesRef: string): string {
  return `${mesRef}-${String(diasNoMes(mesRef)).padStart(2, '0')}`;
}

/** "2026-01" + (-1) → "2025-12". */
export function deslocarMes(mesRef: string, delta: number): string {
  const [ano, mes] = mesRef.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function diasNoMes(mesRef: string): number {
  const [ano, mes] = mesRef.split('-').map(Number);
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/**
 * Último instante do mês local, em UTC — usado para decidir quem "existia"
 * naquele mês (vendedor cadastrado/inativado). Aproximação de 1 dia de folga
 * no fuso é irrelevante para cadastro, e evita depender de tabela de fusos.
 */
export function fimDoMesUtc(mesRef: string): Date {
  const [ano, mes] = mesRef.split('-').map(Number);
  return new Date(Date.UTC(ano, mes, 1, 3, 0, 0) - 1);
}

export function inicioDoMesUtc(mesRef: string): Date {
  const [ano, mes] = mesRef.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, 1, 3, 0, 0));
}
