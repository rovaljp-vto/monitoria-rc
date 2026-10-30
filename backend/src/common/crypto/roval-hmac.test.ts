import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  timestampDentroDaJanela,
  validarTokenSso,
  verificarAssinaturaBody,
  verificarAssinaturaTimestamp,
} from './roval-hmac';

const SEGREDO = 'b'.repeat(64);
const hmac = (dados: string | Buffer) => createHmac('sha256', SEGREDO).update(dados).digest('hex');
const agora = () => Math.floor(Date.now() / 1000);

function token(payload: Record<string, unknown>, segredo = SEGREDO): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${b64}.${createHmac('sha256', segredo).update(b64).digest('hex')}`;
}

describe('webhook (INTEGRATION.md) — HMAC sobre os bytes crus', () => {
  const corpo = Buffer.from('{"event":"user.upsert","user":{"nome":"Maria"}}');

  it('aceita com e sem o prefixo sha256=', () => {
    expect(verificarAssinaturaBody(SEGREDO, corpo, `sha256=${hmac(corpo)}`)).toBe(true);
    expect(verificarAssinaturaBody(SEGREDO, corpo, hmac(corpo))).toBe(true);
  });

  it('recusa corpo reserializado (um espaço a mais já muda a assinatura)', () => {
    const outro = Buffer.from('{"event": "user.upsert","user":{"nome":"Maria"}}');
    expect(verificarAssinaturaBody(SEGREDO, outro, `sha256=${hmac(corpo)}`)).toBe(false);
  });

  it('recusa assinatura vazia ou de outro segredo', () => {
    expect(verificarAssinaturaBody(SEGREDO, corpo, '')).toBe(false);
    const errada = createHmac('sha256', 'outro').update(corpo).digest('hex');
    expect(verificarAssinaturaBody(SEGREDO, corpo, `sha256=${errada}`)).toBe(false);
  });
});

describe('catálogo (GUIA-INTEGRACAO §13.1) — HMAC sobre a string do timestamp', () => {
  it('confere a assinatura do timestamp', () => {
    const ts = String(agora());
    expect(verificarAssinaturaTimestamp(SEGREDO, ts, `sha256=${hmac(ts)}`)).toBe(true);
    expect(verificarAssinaturaTimestamp(SEGREDO, ts, `sha256=${hmac('1')}`)).toBe(false);
  });

  it('janela anti-replay de 5 minutos', () => {
    expect(timestampDentroDaJanela(String(agora()))).toBe(true);
    expect(timestampDentroDaJanela(String(agora() - 299))).toBe(true);
    expect(timestampDentroDaJanela(String(agora() - 3600))).toBe(false);
    expect(timestampDentroDaJanela('abc')).toBe(false);
  });
});

describe('SSO (GUIA-SSO.md) — token <base64url>.<hex>', () => {
  const base = { userId: 'u', username: '0123-JOAO', codigoFuncionario: '0123', nome: 'João', superAdmin: false, moduleId: 'mod-1' };

  it('aceita token válido', () => {
    const r = validarTokenSso(SEGREDO, token({ ...base, iat: agora(), exp: agora() + 90 }), 'mod-1');
    expect(r.ok).toBe(true);
  });

  it('recusa assinatura de outro segredo', () => {
    const r = validarTokenSso(SEGREDO, token({ ...base, iat: agora(), exp: agora() + 90 }, 'outro'));
    expect(r).toMatchObject({ ok: false, motivo: 'assinatura' });
  });

  it('recusa token expirado', () => {
    const r = validarTokenSso(SEGREDO, token({ ...base, iat: agora() - 200, exp: agora() - 110 }));
    expect(r).toMatchObject({ ok: false, motivo: 'expirado' });
  });

  it('recusa token emitido para outro módulo', () => {
    const r = validarTokenSso(SEGREDO, token({ ...base, iat: agora(), exp: agora() + 90 }), 'mod-2');
    expect(r).toMatchObject({ ok: false, motivo: 'modulo' });
  });

  it('recusa formato sem separador', () => {
    expect(validarTokenSso(SEGREDO, 'semponto')).toMatchObject({ ok: false, motivo: 'malformado' });
  });
});
