/**
 * Cliente HTTP.
 *
 * Mesma origem do backend (sem CORS), então a autenticação é só o cookie de
 * sessão HttpOnly — não há token em JavaScript para vazar por XSS.
 */

export interface ErroApi {
  statusCode: number;
  message: string | string[];
  error: string;
  path?: string;
  timestamp?: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly corpo: ErroApi,
  ) {
    super(
      Array.isArray(corpo.message) ? corpo.message.join('\n') : corpo.message,
    );
    this.name = 'ApiError';
  }

  /** 401 = a sessão caiu (bloqueio, revogação, expiração). */
  get sessaoInvalida(): boolean {
    return this.status === 401;
  }
}

async function requisitar<T>(
  metodo: string,
  caminho: string,
  corpo?: unknown,
): Promise<T> {
  const resposta = await fetch(caminho, {
    method: metodo,
    // `same-origin` já envia o cookie; explicitar evita surpresa se um dia o
    // frontend for servido de outro host.
    credentials: 'same-origin',
    headers: corpo !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });

  if (!resposta.ok) {
    let erro: ErroApi;
    try {
      erro = (await resposta.json()) as ErroApi;
    } catch {
      erro = {
        statusCode: resposta.status,
        message: resposta.statusText || 'Falha na requisição',
        error: 'Error',
      };
    }
    throw new ApiError(resposta.status, erro);
  }

  if (resposta.status === 204) return undefined as T;
  return (await resposta.json()) as T;
}

function comQuery(caminho: string, params?: Record<string, unknown>): string {
  if (!params) return caminho;
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    if (valor === undefined || valor === null || valor === '') continue;
    if (Array.isArray(valor)) {
      for (const v of valor) busca.append(chave, String(v));
    } else if (valor instanceof Date) {
      busca.set(chave, valor.toISOString());
    } else {
      busca.set(chave, String(valor));
    }
  }
  const qs = busca.toString();
  return qs ? `${caminho}?${qs}` : caminho;
}

/** Envio de arquivos (multipart). Sem Content-Type: o navegador põe o boundary. */
async function enviarArquivos<T>(caminho: string, campo: string, arquivos: Blob[]): Promise<T> {
  const corpo = new FormData();
  arquivos.forEach((a, i) => corpo.append(campo, a, a instanceof File ? a.name : `imagem-${i + 1}`));
  const resposta = await fetch(caminho, { method: 'POST', credentials: 'same-origin', body: corpo });
  if (!resposta.ok) {
    let erro: ErroApi;
    try {
      erro = (await resposta.json()) as ErroApi;
    } catch {
      erro = { statusCode: resposta.status, message: resposta.statusText || 'Falha no envio', error: 'Error' };
    }
    throw new ApiError(resposta.status, erro);
  }
  return (await resposta.json()) as T;
}

export const api = {
  arquivos: enviarArquivos,
  get: <T>(caminho: string, params?: Record<string, unknown>) =>
    requisitar<T>('GET', comQuery(caminho, params)),
  post: <T>(caminho: string, corpo?: unknown) =>
    requisitar<T>('POST', caminho, corpo ?? {}),
  patch: <T>(caminho: string, corpo?: unknown) =>
    requisitar<T>('PATCH', caminho, corpo ?? {}),
  delete: <T>(caminho: string) => requisitar<T>('DELETE', caminho),
  put: <T>(caminho: string, corpo?: unknown) =>
    requisitar<T>('PUT', caminho, corpo ?? {}),
};
