/**
 * Identificação de imagem pelos primeiros bytes (magic number).
 *
 * O `Content-Type` de um upload é declarado pelo CLIENTE: renomear um arquivo
 * qualquer para `.png` passa por quem só olha o cabeçalho. Aqui o tipo é
 * DEDUZIDO do conteúdo — o que o navegador disse é ignorado. Mesmo princípio
 * do Chamados TI (file-signatures.ts), restrito às imagens que o sistema aceita.
 *
 * SVG fica de fora de propósito: carrega script e, servido inline, vira XSS.
 */

export type MimeImagem = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

const ASSINATURAS: { mime: MimeImagem; bytes: (number | null)[] }[] = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38, null, 0x61] }, // GIF87a / GIF89a
  // RIFF....WEBP — os 4 bytes do tamanho variam.
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50] },
];

export function identificarImagem(buffer: Buffer): MimeImagem | null {
  for (const a of ASSINATURAS) {
    if (buffer.length >= a.bytes.length && a.bytes.every((b, i) => b === null || buffer[i] === b)) {
      return a.mime;
    }
  }
  return null;
}

export const LIMITE_IMAGEM_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGENS_POR_OBSERVACAO = 6;
