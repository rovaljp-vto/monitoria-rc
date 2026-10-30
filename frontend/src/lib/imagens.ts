/**
 * Imagens escolhidas pela monitora antes de subir para o servidor.
 *
 * Print de celular chega fácil a 4–6 MB e 3000px; guardado no banco, isso pesa
 * no backup sem ganhar nada na tela. Aqui a imagem é reduzida para no máximo
 * 2000px no lado maior e recodificada em WebP — o suficiente para ler uma
 * conversa de WhatsApp com folga. GIF passa intacto (animação).
 */

export const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const MAX_IMAGENS = 6;
export const LIMITE_BYTES = 8 * 1024 * 1024;

const LADO_MAXIMO = 2000;
const PEQUENA_O_BASTANTE = 700 * 1024;

export async function reduzirImagem(arquivo: File): Promise<Blob> {
  if (arquivo.type === 'image/gif') return arquivo;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(arquivo);
  } catch {
    return arquivo; // o servidor decide se aceita
  }
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  if (escala === 1 && arquivo.size <= PEQUENA_O_BASTANTE) {
    bitmap.close();
    return arquivo;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/webp', 0.85));
  // Se a recodificação não compensou, fica o original.
  return blob && blob.size < arquivo.size ? blob : arquivo;
}

export const urlImagem = (id: string) => `/api/imagens/${id}`;
