import { CanalAtendimento, Faixa, RespostaCriterio } from '@prisma/client';
import { z } from 'zod';
import { FORMATO_MES } from '../../common/tempo/mes';

export const RegistrarSchema = z
  .object({
    /** Obrigatório no módulo Vendedores; proibido no de Lojas (validado no service). */
    vendedorId: z.string().uuid().optional(),
    lojaId: z.string().uuid(),
    canal: z.nativeEnum(CanalAtendimento).optional(),
    dataReferencia: z.string().datetime({ offset: true }),
    /**
     * Versão do checklist que o formulário exibiu. Se outra versão entrou em
     * vigor enquanto a pessoa preenchia, o registro é recusado em vez de
     * gravar respostas contra perguntas que ela não viu.
     */
    versaoId: z.string().uuid(),
    respostas: z
      .array(
        z
          .object({
            perguntaId: z.string().uuid(),
            resposta: z.nativeEnum(RespostaCriterio),
            /** Observação sobre este critério, escrita durante a monitoria. */
            observacao: z.string().trim().max(1000).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    observacao: z.string().trim().max(4000).optional(),
    /** A observação geral terá imagens (enviadas logo após o registro). */
    observacaoComImagens: z.boolean().optional(),
  })
  .strict();

/**
 * Observação complementar. Texto de pelo menos 3 caracteres — ou nenhum texto,
 * quando ela é só imagem (as imagens vêm em seguida, em /observacoes/:id/imagens).
 */
export const ObservacaoSchema = z
  .object({ texto: z.string().trim().max(4000).default(''), comImagens: z.boolean().optional() })
  .strict()
  .refine((o) => o.texto.length >= 3 || o.comImagens, { message: 'Escreva a observação ou anexe uma imagem.' });

export type ObservacaoDto = z.infer<typeof ObservacaoSchema>;

const textoFeedback = z.string().trim().max(4000).optional();

/** Feedback apresentado ao avaliado — pelo menos um campo preenchido. */
export const FeedbackSchema = z
  .object({
    autoavaliacao: z.number().int().min(0).max(100).optional(),
    pontosFortes: textoFeedback,
    pontosMelhorar: textoFeedback,
    combinados: textoFeedback,
    /** As imagens chegam logo depois, em /feedbacks/:id/imagens. */
    comImagens: z.boolean().optional(),
  })
  .strict()
  .refine((f) => f.autoavaliacao !== undefined || f.pontosFortes || f.pontosMelhorar || f.combinados || f.comImagens, {
    message: 'Preencha ao menos um campo do feedback.',
  });

export type FeedbackDto = z.infer<typeof FeedbackSchema>;

/**
 * Retificação — mesmo corpo do registro, mais o motivo obrigatório. O motivo
 * fica gravado na retificação e na auditoria; sem ele a edição não existe.
 */
export const RetificarSchema = RegistrarSchema.extend({
  motivo: z
    .string()
    .trim()
    .min(5, 'Explique o motivo da edição (mínimo 5 caracteres).')
    .max(1000),
});

export type Retificar = z.infer<typeof RetificarSchema>;

export const ListarSchema = z
  .object({
    mes: z.string().regex(FORMATO_MES).optional(),
    lojaId: z.string().uuid().optional(),
    vendedorId: z.string().uuid().optional(),
    faixa: z.nativeEnum(Faixa).optional(),
    pagina: z.coerce.number().int().min(1).max(10_000).default(1),
  })
  .strict();

export type Registrar = z.infer<typeof RegistrarSchema>;
export type Listar = z.infer<typeof ListarSchema>;
