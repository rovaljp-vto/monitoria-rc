import { describe, expect, it } from 'vitest';
import { dataLocal, diaAnterior, ultimoDiaDoMes, deslocarMes, diasNoMes, fimDoMesUtc, inicioDoMesUtc, mesDe } from './mes';

const SP = 'America/Sao_Paulo';

describe('mês de referência no fuso da empresa (regra 1)', () => {
  it('atendimento às 22h do dia 31 em São Paulo conta no próprio mês, não no seguinte', () => {
    // 31/10 22:00 em SP = 01/11 01:00 UTC
    expect(mesDe(new Date('2026-11-01T01:00:00Z'), SP)).toBe('2026-10');
  });

  it('meia-noite local já é o mês novo', () => {
    // 01/11 00:00 em SP = 01/11 03:00 UTC
    expect(mesDe(new Date('2026-11-01T03:00:00Z'), SP)).toBe('2026-11');
  });

  it('limites do mês em UTC para o fuso -03', () => {
    expect(inicioDoMesUtc('2026-09').toISOString()).toBe('2026-09-01T03:00:00.000Z');
    expect(fimDoMesUtc('2026-09').toISOString()).toBe('2026-10-01T02:59:59.999Z');
    expect(fimDoMesUtc('2026-12').toISOString()).toBe('2027-01-01T02:59:59.999Z');
  });

  it('data local, dia anterior e último dia do mês', () => {
    expect(dataLocal(new Date('2026-11-01T01:00:00Z'), SP)).toBe('2026-10-31');
    expect(diaAnterior('2026-03-01')).toBe('2026-02-28');
    expect(ultimoDiaDoMes('2028-02')).toBe('2028-02-29');
  });

  it('desloca meses atravessando a virada do ano', () => {
    expect(deslocarMes('2026-01', -1)).toBe('2025-12');
    expect(deslocarMes('2026-11', 3)).toBe('2027-02');
    expect(deslocarMes('2026-09', -11)).toBe('2025-10');
  });

  it('dias no mês, inclusive fevereiro bissexto', () => {
    expect(diasNoMes('2026-09')).toBe(30);
    expect(diasNoMes('2028-02')).toBe(29);
  });
});
