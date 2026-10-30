import { type ClipboardEvent, type DragEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, ImagePlus, X } from 'lucide-react';
import { LIMITE_BYTES, MAX_IMAGENS, TIPOS_ACEITOS, urlImagem } from '@/lib/imagens';
import { cx, EASE } from './ui';

/**
 * Área de observação que aceita imagens: envolve o campo de texto e recebe
 * arquivos por três caminhos — botão, arrastar e soltar, e Ctrl+V de um print
 * (o jeito mais rápido de trazer uma conversa de WhatsApp).
 */
export function AreaComImagens({
  arquivos,
  onArquivos,
  children,
}: {
  arquivos: File[];
  onArquivos: (a: File[]) => void;
  children: ReactNode;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const previas = useMemo(() => arquivos.map((a) => URL.createObjectURL(a)), [arquivos]);
  useEffect(() => () => previas.forEach((u) => URL.revokeObjectURL(u)), [previas]);

  function acrescentar(novos: File[]) {
    const imagens = novos.filter((f) => TIPOS_ACEITOS.includes(f.type));
    const recusadas = novos.length - imagens.length;
    const grandes = imagens.filter((f) => f.size > LIMITE_BYTES * 3); // o navegador reduz; acima disso nem tenta
    const aceitas = imagens.filter((f) => !grandes.includes(f));
    const cabem = aceitas.slice(0, Math.max(0, MAX_IMAGENS - arquivos.length));
    const mensagens = [
      recusadas && `${recusadas} arquivo(s) ignorado(s): só JPG, PNG, WebP ou GIF.`,
      grandes.length && `${grandes.length} imagem(ns) grande(s) demais.`,
      cabem.length < aceitas.length && `Limite de ${MAX_IMAGENS} imagens por observação.`,
    ].filter(Boolean);
    setAviso(mensagens.length ? mensagens.join(' ') : null);
    if (cabem.length) onArquivos([...arquivos, ...cabem]);
  }

  function colar(e: ClipboardEvent) {
    const arqs = [...e.clipboardData.files];
    if (!arqs.length) return; // colou texto: segue normal no campo
    e.preventDefault();
    acrescentar(arqs.map((f, i) => (f.name && f.name !== 'image.png' ? f : new File([f], `print-${Date.now()}-${i + 1}.png`, { type: f.type }))));
  }

  function soltar(e: DragEvent) {
    e.preventDefault();
    setArrastando(false);
    acrescentar([...e.dataTransfer.files]);
  }

  return (
    <div
      onPaste={colar}
      onDragOver={(e) => {
        if ([...e.dataTransfer.types].includes('Files')) {
          e.preventDefault();
          setArrastando(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setArrastando(false);
      }}
      onDrop={soltar}
      className={cx('relative flex flex-col gap-2 rounded-xl transition', arrastando && 'ring-2 ring-marca ring-offset-2 ring-offset-bg')}
    >
      {children}

      {arrastando && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-xl border-2 border-dashed border-marca bg-marca-suave/80 backdrop-blur-sm">
          <span className="flex items-center gap-2 font-semibold text-marca-texto">
            <ImagePlus className="size-5" aria-hidden /> Solte as imagens aqui
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {previas.map((url, i) => (
          <motion.div
            key={url}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="group relative size-20 overflow-hidden rounded-xl border border-borda bg-card"
          >
            <img src={url} alt={`Imagem ${i + 1} a enviar`} className="size-full object-cover" />
            <button
              type="button"
              onClick={() => onArquivos(arquivos.filter((_, j) => j !== i))}
              className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/70 text-white opacity-90 transition hover:bg-critico"
              aria-label={`Remover imagem ${i + 1}`}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </motion.div>
        ))}
        {arquivos.length < MAX_IMAGENS && (
          <button
            type="button"
            onClick={() => entrada.current?.click()}
            className={cx(
              'flex items-center gap-2 rounded-xl border border-dashed border-borda-forte px-3.5 text-sm font-medium text-fg-2 transition hover:border-marca/60 hover:text-marca-texto',
              arquivos.length ? 'size-20 flex-col justify-center px-1 text-xs' : 'h-10',
            )}
          >
            <ImagePlus className="size-4" aria-hidden />
            {arquivos.length ? 'Mais' : 'Adicionar imagens'}
          </button>
        )}
        {!arquivos.length && <span className="text-xs text-fg-3">ou arraste, ou cole um print com Ctrl+V</span>}
        <input
          ref={entrada}
          type="file"
          accept={TIPOS_ACEITOS.join(',')}
          multiple
          hidden
          onChange={(e) => {
            acrescentar([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
      </div>
      {aviso && (
        <p className="text-xs text-regular" role="status">
          {aviso}
        </p>
      )}
    </div>
  );
}

/** Miniaturas de imagens já gravadas; clicar abre a ampliação. */
export function Galeria({ ids, tamanho = 'md' }: { ids: string[]; tamanho?: 'md' | 'lg' }) {
  const [aberta, setAberta] = useState<number | null>(null);
  if (!ids.length) return null;
  return (
    <>
      <ul className="flex flex-wrap gap-2">
        {ids.map((id, i) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => setAberta(i)}
              className={cx(
                'group block overflow-hidden rounded-xl border border-borda bg-card transition hover:border-borda-forte',
                tamanho === 'lg' ? 'size-32 sm:size-40' : 'size-20',
              )}
              aria-label={`Ampliar imagem ${i + 1} de ${ids.length}`}
            >
              <img src={urlImagem(id)} alt="" loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-105" />
            </button>
          </li>
        ))}
      </ul>
      <Ampliacao ids={ids} indice={aberta} onIndice={setAberta} />
    </>
  );
}

function Ampliacao({ ids, indice, onIndice }: { ids: string[]; indice: number | null; onIndice: (i: number | null) => void }) {
  useEffect(() => {
    if (indice === null) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onIndice(null);
      if (e.key === 'ArrowRight') onIndice((indice + 1) % ids.length);
      if (e.key === 'ArrowLeft') onIndice((indice - 1 + ids.length) % ids.length);
      // Não deixa a apresentação de feedback trocar de etapa por baixo.
      e.stopPropagation();
    };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, [indice, ids.length, onIndice]);

  return createPortal(
    <AnimatePresence>
      {indice !== null && (
        <motion.div
          role="dialog"
          aria-modal
          aria-label={`Imagem ${indice + 1} de ${ids.length}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] grid place-items-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => onIndice(null)}
        >
          <motion.img
            key={ids[indice]}
            src={urlImagem(ids[indice])}
            alt={`Imagem ${indice + 1} de ${ids.length}`}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="max-h-[88dvh] max-w-[92vw] rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button type="button" onClick={() => onIndice(null)} className="absolute right-4 top-4 grid size-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Fechar">
            <X className="size-5" aria-hidden />
          </button>
          {ids.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onIndice((indice - 1 + ids.length) % ids.length);
                }}
                className="absolute left-4 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
                aria-label="Imagem anterior"
              >
                <ChevronLeft className="size-6" aria-hidden />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onIndice((indice + 1) % ids.length);
                }}
                className="absolute right-4 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
                aria-label="Próxima imagem"
              >
                <ChevronRight className="size-6" aria-hidden />
              </button>
              <span className="num absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-sm text-white">
                {indice + 1} / {ids.length}
              </span>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
