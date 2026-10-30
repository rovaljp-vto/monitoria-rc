import { describe, expect, it } from 'vitest';
import { identificarImagem } from './imagem';

const b = (...x: number[]) => Buffer.from([...x, 0, 0, 0, 0, 0, 0, 0, 0]);

describe('identificarImagem — pelo conteúdo, não pelo nome', () => {
  it('reconhece JPEG, PNG, GIF e WebP', () => {
    expect(identificarImagem(b(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(identificarImagem(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(identificarImagem(Buffer.from('GIF89a......'))).toBe('image/gif');
    expect(identificarImagem(Buffer.from('RIFF\x10\x00\x00\x00WEBPVP8 ', 'latin1'))).toBe('image/webp');
  });

  it('recusa o que não é imagem, inclusive SVG e executável renomeado', () => {
    expect(identificarImagem(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>'))).toBeNull();
    expect(identificarImagem(Buffer.from('MZ\x90\x00executavel', 'latin1'))).toBeNull();
    expect(identificarImagem(Buffer.from('%PDF-1.7'))).toBeNull();
    expect(identificarImagem(Buffer.alloc(2))).toBeNull();
  });
});
