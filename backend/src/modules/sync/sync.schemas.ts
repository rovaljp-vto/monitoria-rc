import { z } from 'zod';

/**
 * Forma do payload de replicação — INTEGRATION.md ("Contrato HTTP") e
 * GUIA-INTEGRACAO-SISTEMAS.md §4 ("Campos do user").
 *
 * ⚠️ Diferente dos DTOs da API interna, este schema é PERMISSIVO (`passthrough`,
 * campos opcionais). Motivo: rejeitar um webhook por um campo novo que o hub
 * passou a enviar quebraria a replicação inteira da empresa. O guia é explícito
 * na direção oposta — o desconhecido é ignorado com aviso, nunca com erro.
 */

const nullish = <T extends z.ZodTypeAny>(schema: T) =>
  schema.nullish().transform((v) => v ?? null);

export const UsuarioRovalSchema = z
  .object({
    id: z.string().optional(),
    nome: z.string().min(1, 'nome é obrigatório'),
    username: z.string().min(1, 'username é obrigatório'),
    codigoFuncionario: nullish(z.string()),
    telefone: nullish(z.string()),
    filial: nullish(z.string()),
    setor: nullish(z.string()),

    /**
     * GUIA-INTEGRACAO §4 documenta `cargo`, mas ele NÃO aparece no payload
     * canônico de INTEGRATION.md nem em GUIA-CRIACAO §8, e não está nos
     * SYNCED_FIELDS (`nome · codigoFuncionario · telefone · filial · setor ·
     * ativo · role`). Aceito quando vier, nunca exigido.
     */
    cargo: nullish(z.string()),

    ativo: z.boolean().default(true),
    bloqueado: z.boolean().default(false),
    superAdmin: z.boolean().default(false),

    /** Opcionais — só em `user.upsert` de não-superAdmin (GUIA-INTEGRACAO §13). */
    permissions: z.array(z.unknown()).optional(),
    /** Ausente em hubs antigos: nesse caso as permissões locais são preservadas. */
    permissionsManaged: z.boolean().optional(),
  })
  .passthrough();

export type UsuarioRoval = z.infer<typeof UsuarioRovalSchema>;

export const EventoSyncSchema = z
  .object({
    event: z.enum(['user.upsert', 'user.disable', 'user.delete'], {
      errorMap: () => ({ message: 'evento desconhecido' }),
    }),
    user: UsuarioRovalSchema,
    timestamp: z.number().optional(),
  })
  .passthrough();

export type EventoSync = z.infer<typeof EventoSyncSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Trilha de VENDEDOR (`vendedor.upsert` / `vendedor.disable`)
//
// Cadastro de vendedor + histórico de lotação, de que o RovalConnecta passou a
// ser a fonte da verdade. Trilha separada da de identidade porque vendedor é
// quem é MONITORADO aqui, não quem faz login: nenhum deles tem o card do
// Checklist no hub, e `user.*` respeita `user.systems`.
// ─────────────────────────────────────────────────────────────────────────────

/** Uma janela do histórico de lotação, como o hub a envia. */
export const LotacaoRovalSchema = z
  .object({
    /** Nome da filial no hub — casado com `lojas.nome` (sem acento/caixa). */
    filial: z.string().min(1, 'filial é obrigatória'),
    dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dataInicio deve ser AAAA-MM-DD'),
    dataFim: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'dataFim deve ser AAAA-MM-DD')
      .nullish()
      .transform((v) => v ?? null),
    motivo: nullish(z.string()),
  })
  .passthrough();

/**
 * Payload de `vendedor.upsert` / `vendedor.disable`.
 *
 * Permissivo pelo mesmo motivo do schema de usuário: campo novo no hub não
 * pode derrubar a replicação da empresa inteira. `lotacoes` ausente vira lista
 * vazia — `filial` sozinho ainda permite lotar o vendedor.
 */
export const VendedorRovalSchema = z
  .object({
    id: z.string().optional(),
    /** Chave estável de associação (GUIA-INTEGRACAO §2). */
    codigoFuncionario: nullish(z.string()),
    nome: z.string().min(1, 'nome é obrigatório'),
    cargo: nullish(z.string()),
    /** Espelho da lotação aberta — usado quando `lotacoes` vem vazio. */
    filial: nullish(z.string()),
    ativo: z.boolean().default(true),
    lotacoes: z.array(LotacaoRovalSchema).default([]),
  })
  .passthrough();

export type VendedorRoval = z.infer<typeof VendedorRovalSchema>;

export const EventoVendedorSchema = z
  .object({
    event: z.enum(['vendedor.upsert', 'vendedor.disable'], {
      errorMap: () => ({ message: 'evento desconhecido' }),
    }),
    vendedor: VendedorRovalSchema,
    timestamp: z.number().optional(),
  })
  .passthrough();

export type EventoVendedor = z.infer<typeof EventoVendedorSchema>;
