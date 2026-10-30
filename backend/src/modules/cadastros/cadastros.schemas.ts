import { z } from 'zod';

const nome = z.string().trim().min(2).max(120);

export const LojaCriarSchema = z.object({ nome, ordem: z.number().int().min(0).max(999).optional() }).strict();

export const LojaEditarSchema = z
  .object({ nome: nome.optional(), ativa: z.boolean().optional(), ordem: z.number().int().min(0).max(999).optional() })
  .strict();

const dataIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD.')
  .nullable();

export const VendedorCriarSchema = z
  .object({ nome, lojaId: z.string().uuid(), admissao: dataIso.optional() })
  .strict();

export const VendedorEditarSchema = z
  .object({
    nome: nome.optional(),
    // Troca de loja é TRANSFERÊNCIA, com data: POST /vendedores/:id/transferencias.
    ativo: z.boolean().optional(),
    admissao: dataIso.optional(),
  })
  .strict();

const nota = z.number().int().min(1).max(100);
const meta = z.number().int().min(1).max(20);

export const ParametrosSchema = z
  .object({
    excelenteMin: nota,
    bomMin: nota,
    regularMin: nota,
    metaBase: meta,
    metaRegular: meta,
    metaCritico: meta,
    diaAlertaFimMes: z.number().int().min(1).max(28),
  })
  .strict()
  .refine((p) => p.excelenteMin > p.bomMin && p.bomMin > p.regularMin, {
    message: 'As faixas precisam ficar em ordem: Excelente > Bom > Regular.',
  })
  .refine((p) => p.metaRegular >= p.metaBase && p.metaCritico >= p.metaRegular, {
    message: 'As metas de foco não podem ser menores que a meta mensal, e Crítico precisa de pelo menos tanto quanto Regular.',
  });

export type LojaCriar = z.infer<typeof LojaCriarSchema>;
export type LojaEditar = z.infer<typeof LojaEditarSchema>;
export type VendedorCriar = z.infer<typeof VendedorCriarSchema>;
export type VendedorEditar = z.infer<typeof VendedorEditarSchema>;
export type ParametrosDto = z.infer<typeof ParametrosSchema>;
