import { createHmac, timingSafeEqual, randomBytes, createHash } from 'node:crypto';

/**
 * Primitivas HMAC do contrato RovalConnecta.
 *
 * Os documentos definem TRÊS assinaturas com formatos diferentes. Elas moram
 * juntas aqui de propósito: trocá-las entre si é o erro mais fácil de cometer
 * e o mais difícil de diagnosticar (falha sempre como "401 assinatura inválida").
 *
 *  1. Webhook  POST /api/sync/users
 *     assina os BYTES CRUS do body · header `X-Roval-Signature: sha256=<hex>`
 *     — INTEGRATION.md, "Validação obrigatória"; GUIA-INTEGRACAO §5.1
 *
 *  2. Catálogo GET /api/sync/permissions
 *     assina a STRING DO TIMESTAMP · header `X-Roval-Signature: sha256=<hex>`
 *     — GUIA-INTEGRACAO §13.1
 *
 *  3. SSO      GET /sso/login?token=<payload>.<hex>
 *     assina o PAYLOAD BASE64URL · SEM o prefixo `sha256=`
 *     — GUIA-SSO.md, "Formato do token"
 */

/** Janela anti-replay: ±5 minutos (INTEGRATION.md; GUIA-INTEGRACAO §5.2). */
export const JANELA_TIMESTAMP_SEGUNDOS = 300;

/**
 * Comparação resistente a timing.
 *
 * `timingSafeEqual` lança se os buffers têm tamanhos diferentes, então o
 * comprimento é conferido antes — como nos exemplos oficiais dos guias.
 */
export function compararSeguro(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function hmacHex(segredo: string, dados: Buffer | string): string {
  return createHmac('sha256', segredo).update(dados).digest('hex');
}

/** Remove o prefixo `sha256=` quando presente (o header aceita as duas formas). */
function semPrefixo(assinatura: string): string {
  return assinatura.startsWith('sha256=') ? assinatura.slice(7) : assinatura;
}

/**
 * (1) Assinatura do webhook — sobre os bytes CRUS do corpo.
 *
 * GUIA-INTEGRACAO §5.1: "Pegar o body cru (bytes), NÃO o JSON parseado".
 * O corpo re-serializado por um parser muda os bytes e invalida a assinatura.
 */
export function verificarAssinaturaBody(
  segredo: string,
  bodyCru: Buffer,
  headerAssinatura: string,
): boolean {
  if (!headerAssinatura) return false;
  return compararSeguro(hmacHex(segredo, bodyCru), semPrefixo(headerAssinatura));
}

/**
 * (2) Assinatura do catálogo — sobre a string do timestamp.
 *
 * GUIA-INTEGRACAO §13.1: `HMAC_SHA256(ROVAL_SYNC_SECRET, "1783440000")`.
 * GET não tem body, então o timestamp é o único material assinado.
 */
export function verificarAssinaturaTimestamp(
  segredo: string,
  timestampCru: string,
  headerAssinatura: string,
): boolean {
  if (!headerAssinatura || !timestampCru) return false;
  return compararSeguro(
    hmacHex(segredo, timestampCru),
    semPrefixo(headerAssinatura),
  );
}

/** Verifica a janela anti-replay. Recebe o header cru. */
export function timestampDentroDaJanela(headerTimestamp: string): boolean {
  const ts = Number(headerTimestamp);
  if (!Number.isFinite(ts) || ts <= 0) return false;
  const agora = Math.floor(Date.now() / 1000);
  return Math.abs(agora - ts) <= JANELA_TIMESTAMP_SEGUNDOS;
}

export interface SsoTokenPayload {
  userId: string;
  username: string;
  codigoFuncionario: string | null;
  nome: string;
  superAdmin: boolean;
  iat: number;
  exp: number;
  moduleId: string;
}

export type ResultadoSso =
  | { ok: true; payload: SsoTokenPayload; iat: number }
  | { ok: false; motivo: 'malformado' | 'assinatura' | 'corrompido' | 'expirado' | 'modulo' };

/**
 * (3) Validação do token SSO — GUIA-SSO.md, "Validações obrigatórias".
 *
 * A ordem importa (GUIA-SSO.md, "Validações obrigatórias"):
 *   1. separar payload e assinatura
 *   2. validar a assinatura ANTES de confiar no conteúdo
 *   3. decodificar e validar o payload
 *   4. verificar iat, exp e moduleId esperado
 *
 * Decodificar antes de conferir a assinatura seria processar dado não confiável.
 */
export function validarTokenSso(
  segredo: string,
  token: string,
  moduleIdEsperado?: string,
): ResultadoSso {
  const separador = token.indexOf('.');
  if (separador <= 0 || separador === token.length - 1) {
    return { ok: false, motivo: 'malformado' };
  }
  const payloadB64 = token.slice(0, separador);
  const assinatura = token.slice(separador + 1);

  // 2. Assinatura primeiro — sem prefixo `sha256=` neste formato.
  if (!compararSeguro(hmacHex(segredo, payloadB64), assinatura)) {
    return { ok: false, motivo: 'assinatura' };
  }

  // 3. Só agora o conteúdo pode ser decodificado.
  let payload: SsoTokenPayload;
  try {
    payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    ) as SsoTokenPayload;
  } catch {
    return { ok: false, motivo: 'corrompido' };
  }

  if (typeof payload?.exp !== 'number' || typeof payload?.iat !== 'number') {
    return { ok: false, motivo: 'corrompido' };
  }

  // 4. Expiração. TTL do hub é de 90s (GUIA-SSO.md).
  const agora = Math.floor(Date.now() / 1000);
  if (agora > payload.exp) return { ok: false, motivo: 'expirado' };
  // `iat` no futuro indica relógio dessincronizado ou token forjado; a margem
  // acompanha a janela do webhook.
  if (payload.iat - agora > JANELA_TIMESTAMP_SEGUNDOS) {
    return { ok: false, motivo: 'expirado' };
  }

  if (moduleIdEsperado && payload.moduleId !== moduleIdEsperado) {
    return { ok: false, motivo: 'modulo' };
  }

  return { ok: true, payload, iat: payload.iat };
}

/**
 * Token de sessão: 32 bytes aleatórios. O valor cru vai para o cookie HttpOnly;
 * no banco fica apenas o hash, de modo que vazar o dump não vaza sessões.
 */
export function gerarTokenSessao(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashTokenSessao(token) };
}

export function hashTokenSessao(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
