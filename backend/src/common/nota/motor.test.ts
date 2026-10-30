import { describe, expect, it } from 'vitest';
import { calcularNota, faixaDaNota, validarPesos, type CriterioMotor } from './motor';

// Checklist de Vendedores do escopo §3.1.
const VENDEDOR: CriterioMotor[] = [
  { id: 'saudacao', peso: 10, tipoResposta: 'SIM_NAO' },
  { id: 'apresentacao', peso: 10, tipoResposta: 'SIM_NAO' },
  { id: 'identificacao', peso: 10, tipoResposta: 'SIM_NAO' },
  { id: 'conducao', peso: 20, tipoResposta: 'SIM_NAO' },
  { id: 'interacao', peso: 15, tipoResposta: 'SIM_NAO' },
  { id: 'postura', peso: 15, tipoResposta: 'SIM_NAO' },
  { id: 'upselling', peso: 20, tipoResposta: 'SIM_NAO_NA' },
];

const todos = (r: 'SIM' | 'NAO') => Object.fromEntries(VENDEDOR.map((c) => [c.id, r]));

describe('calcularNota', () => {
  it('tudo Sim vale 100 e é Excelente', () => {
    const r = calcularNota(VENDEDOR, todos('SIM'));
    expect(r).toMatchObject({ ok: true, nota: 100, faixa: 'EXCELENTE' });
  });

  it('tudo Não vale 0 e é Crítico', () => {
    expect(calcularNota(VENDEDOR, todos('NAO'))).toMatchObject({ ok: true, nota: 0, faixa: 'CRITICO' });
  });

  it('soma o peso de cada Sim', () => {
    const r = calcularNota(VENDEDOR, { ...todos('SIM'), conducao: 'NAO', upselling: 'NAO' });
    expect(r).toMatchObject({ ok: true, nota: 60, faixa: 'REGULAR' });
  });

  it('N/A redistribui: sem o upselling, os 80 restantes passam a valer 100 (escopo §3.3)', () => {
    const r = calcularNota(VENDEDOR, { ...todos('SIM'), upselling: 'NA' });
    expect(r).toMatchObject({ ok: true, nota: 100 });

    // Errar a condução (20 de 80) com upselling N/A → 75.
    const r2 = calcularNota(VENDEDOR, { ...todos('SIM'), upselling: 'NA', conducao: 'NAO' });
    expect(r2).toMatchObject({ ok: true, nota: 75, faixa: 'BOM' });
    if (r2.ok) {
      const pesos = r2.itens.reduce((s, i) => s + i.pesoEfetivo, 0);
      expect(pesos).toBeCloseTo(100, 10);
      expect(r2.itens.find((i) => i.criterioId === 'upselling')?.pesoEfetivo).toBe(0);
    }
  });

  it('arredonda em 2 casas quando a redistribuição não é exata', () => {
    const c: CriterioMotor[] = [
      { id: 'a', peso: 33, tipoResposta: 'SIM_NAO' },
      { id: 'b', peso: 33, tipoResposta: 'SIM_NAO' },
      { id: 'c', peso: 34, tipoResposta: 'SIM_NAO_NA' },
    ];
    const r = calcularNota(c, { a: 'SIM', b: 'NAO', c: 'NA' });
    expect(r).toMatchObject({ ok: true, nota: 50 });
    const r2 = calcularNota(
      [
        { id: 'a', peso: 10, tipoResposta: 'SIM_NAO' },
        { id: 'b', peso: 20, tipoResposta: 'SIM_NAO' },
        { id: 'n', peso: 70, tipoResposta: 'SIM_NAO_NA' },
      ],
      { a: 'SIM', b: 'NAO', n: 'NA' },
    );
    expect(r2).toMatchObject({ ok: true, nota: 33.33 });
  });

  it('todos N/A invalida a monitoria (regra 3)', () => {
    const c: CriterioMotor[] = [
      { id: 'a', peso: 50, tipoResposta: 'SIM_NAO_NA' },
      { id: 'b', peso: 50, tipoResposta: 'SIM_NAO_NA' },
    ];
    expect(calcularNota(c, { a: 'NA', b: 'NA' }).ok).toBe(false);
  });

  it('recusa N/A em critério que não permite', () => {
    expect(calcularNota(VENDEDOR, { ...todos('SIM'), saudacao: 'NA' }).ok).toBe(false);
  });

  it('aponta os critérios sem resposta', () => {
    const r = calcularNota(VENDEDOR, { saudacao: 'SIM' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.faltando).toHaveLength(6);
  });
});

describe('faixaDaNota', () => {
  it('respeita os limites do escopo §3.4', () => {
    expect(faixaDaNota(90)).toBe('EXCELENTE');
    expect(faixaDaNota(89.99)).toBe('BOM');
    expect(faixaDaNota(75)).toBe('BOM');
    expect(faixaDaNota(74.99)).toBe('REGULAR');
    expect(faixaDaNota(60)).toBe('REGULAR');
    expect(faixaDaNota(59.99)).toBe('CRITICO');
  });

  it('aceita limites configurados', () => {
    expect(faixaDaNota(85, { excelenteMin: 85, bomMin: 70, regularMin: 50 })).toBe('EXCELENTE');
  });
});

describe('validarPesos', () => {
  it('exige soma 100 com inteiros positivos', () => {
    expect(validarPesos(VENDEDOR)).toBeNull();
    expect(validarPesos([{ peso: 50 }, { peso: 40 }])).toMatch(/somam 90/);
    expect(validarPesos([{ peso: 100 }, { peso: 0 }])).not.toBeNull();
    expect(validarPesos([])).not.toBeNull();
  });
});
