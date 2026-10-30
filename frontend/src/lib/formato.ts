/**
 * Formatação pt-BR. Datas chegam em UTC e são exibidas no fuso da empresa.
 */
const TZ = 'America/Sao_Paulo';

const dataHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const data = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const diaMes = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: 'short' });
const nota = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });

export const fmtDataHora = (iso: string) => dataHora.format(new Date(iso));
export const fmtData = (iso: string) => data.format(new Date(iso));
/** Data sem hora (ex.: admissão): gravada à meia-noite UTC, exibida sem fuso para não virar o dia anterior. */
export const fmtDataPura = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
export const fmtDiaMes = (iso: string) => diaMes.format(new Date(iso)).replace('.', '');
export const fmtNota = (n: number | null | undefined) => (n === null || n === undefined ? '—' : nota.format(n));

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "2026-09" → "setembro de 2026" */
export function fmtMes(mesRef: string, curto = false): string {
  const [ano, mes] = mesRef.split('-').map(Number);
  const nome = MESES[mes - 1];
  return curto ? `${nome.slice(0, 3)}/${String(ano).slice(2)}` : `${nome} de ${ano}`;
}

export function mesAtual(): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).format(new Date());
  return p.slice(0, 7);
}

export function deslocarMes(mesRef: string, delta: number): string {
  const [ano, mes] = mesRef.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Valor para <input type="datetime-local"> com o horário local de agora. */
export function agoraLocal(): string {
  return paraInputLocal(new Date());
}

/** Converte um instante para o valor de <input type="datetime-local">. */
export function paraInputLocal(instante: string | Date): string {
  const d = new Date(instante);
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

export function iniciais(nome: string): string {
  // Só palavras que começam com letra: "(demo)" ou "-" não viram inicial.
  const partes = nome.trim().split(/\s+/).filter((p) => /^\p{L}/u.test(p));
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}
