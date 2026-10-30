import { motion, useReducedMotion } from 'motion/react';
import { EASE } from './ui';

/**
 * Peça central da home — faz o papel do megafone do Roval Escuta: uma prancheta
 * de checklist com o anel de nota. Vetorial (nítida em qualquer tela, sem peso
 * de imagem) e decorativa: aria-hidden.
 */
const LINHAS = [
  { y: 150, ok: true, largura: 150 },
  { y: 200, ok: true, largura: 120 },
  { y: 250, ok: false, largura: 140 },
  { y: 300, ok: true, largura: 105 },
  { y: 350, ok: true, largura: 130 },
];

export function IlustracaoMonitoria({ className }: { className?: string }) {
  const reduzir = useReducedMotion();
  return (
    <motion.svg
      viewBox="0 0 420 470"
      className={className}
      aria-hidden
      initial={reduzir ? false : { opacity: 0, scale: 0.94, rotate: -4 }}
      animate={{ opacity: 1, scale: 1, rotate: -6 }}
      transition={{ duration: 1, ease: EASE }}
    >
      <defs>
        <linearGradient id="il-prancheta" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ef4444" />
          <stop offset=".55" stopColor="#c01631" />
          <stop offset="1" stopColor="#7f1022" />
        </linearGradient>
        <linearGradient id="il-papel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#ece6e6" />
        </linearGradient>
        <linearGradient id="il-clipe" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4f4f5" />
          <stop offset="1" stopColor="#a1a1aa" />
        </linearGradient>
        <radialGradient id="il-brilho" cx=".3" cy=".2" r=".8">
          <stop offset="0" stopColor="#fff" stopOpacity=".35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <filter id="il-sombra" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="28" stdDeviation="22" floodColor="#000" floodOpacity=".45" />
        </filter>
      </defs>

      <g filter="url(#il-sombra)">
        <rect x="40" y="40" width="300" height="400" rx="34" fill="url(#il-prancheta)" />
        <rect x="40" y="40" width="300" height="400" rx="34" fill="url(#il-brilho)" />
        <rect x="68" y="92" width="244" height="322" rx="16" fill="url(#il-papel)" />
        <rect x="140" y="22" width="100" height="52" rx="16" fill="url(#il-clipe)" />
        <rect x="165" y="36" width="50" height="14" rx="7" fill="#71717a" />
      </g>

      {LINHAS.map((l, i) => (
        <g key={l.y}>
          <motion.circle
            cx="104"
            cy={l.y}
            r="14"
            fill={l.ok ? '#059669' : '#dc2626'}
            initial={reduzir ? false : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5 + i * 0.12, duration: 0.45, ease: EASE }}
            style={{ transformOrigin: `104px ${l.y}px` }}
          />
          <motion.path
            d={l.ok ? `M97 ${l.y} l5 5 l9 -10` : `M99 ${l.y - 5} l10 10 M109 ${l.y - 5} l-10 10`}
            stroke="#fff"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            initial={reduzir ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.75 + i * 0.12, duration: 0.35 }}
          />
          <rect x="132" y={l.y - 9} width={l.largura} height="8" rx="4" fill="#d4d4d8" />
          <rect x="132" y={l.y + 5} width={l.largura * 0.55} height="6" rx="3" fill="#e4e4e7" />
        </g>
      ))}

      {/* Anel de nota flutuando sobre a prancheta */}
      <motion.g
        initial={reduzir ? false : { opacity: 0, y: 18 }}
        animate={reduzir ? { opacity: 1 } : { opacity: 1, y: [0, -8, 0] }}
        transition={
          reduzir
            ? { duration: 0.3 }
            : { opacity: { delay: 1.1, duration: 0.5 }, y: { delay: 1.1, duration: 5, repeat: Infinity, ease: 'easeInOut' } }
        }
      >
        <circle cx="330" cy="370" r="66" fill="#140808" stroke="#ffffff" strokeOpacity=".12" strokeWidth="2" />
        <circle cx="330" cy="370" r="50" fill="none" stroke="#ffffff" strokeOpacity=".12" strokeWidth="10" />
        <motion.circle
          cx="330"
          cy="370"
          r="50"
          fill="none"
          stroke="#34d399"
          strokeWidth="10"
          strokeLinecap="round"
          transform="rotate(-90 330 370)"
          initial={reduzir ? false : { pathLength: 0 }}
          animate={{ pathLength: 0.92 }}
          transition={{ delay: 1.3, duration: 1.2, ease: EASE }}
        />
        <text x="330" y="382" textAnchor="middle" fontFamily="'Bodoni Moda Variable', Georgia, serif" fontSize="36" fontWeight="700" fill="#fff">
          92
        </text>
      </motion.g>
    </motion.svg>
  );
}
