-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EstadoUsuario" AS ENUM ('PENDENTE', 'ATIVO', 'BLOQUEADO', 'EXCLUIDO');

-- CreateEnum
CREATE TYPE "OrigemCadastro" AS ENUM ('ROVAL', 'LOCAL');

-- CreateEnum
CREATE TYPE "ResultadoSync" AS ENUM ('OK', 'ERRO');

-- CreateEnum
CREATE TYPE "TipoModulo" AS ENUM ('VENDEDOR', 'LOJA');

-- CreateEnum
CREATE TYPE "TipoResposta" AS ENUM ('SIM_NAO', 'SIM_NAO_NA');

-- CreateEnum
CREATE TYPE "RespostaCriterio" AS ENUM ('SIM', 'NAO', 'NA');

-- CreateEnum
CREATE TYPE "Faixa" AS ENUM ('EXCELENTE', 'BOM', 'REGULAR', 'CRITICO');

-- CreateEnum
CREATE TYPE "CanalAtendimento" AS ENUM ('BALCAO', 'WHATSAPP');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "codigo_funcionario" TEXT,
    "roval_user_id" TEXT,
    "username_roval" TEXT,
    "nome_roval" TEXT,
    "nome" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "telefone" TEXT,
    "filial" TEXT,
    "setor" TEXT,
    "cargo" TEXT,
    "estado" "EstadoUsuario" NOT NULL DEFAULT 'PENDENTE',
    "origem" "OrigemCadastro" NOT NULL DEFAULT 'ROVAL',
    "is_admin_local" BOOLEAN NOT NULL DEFAULT false,
    "linked_to_roval" BOOLEAN NOT NULL DEFAULT false,
    "permissions_managed" BOOLEAN NOT NULL DEFAULT false,
    "last_roval_sync_at" TIMESTAMP(3),
    "ultimo_acesso_em" TIMESTAMP(3),
    "bloqueado_em" TIMESTAMP(3),
    "excluido_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_permissoes" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "concedida_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_permissoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessoes" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimo_uso_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_em" TIMESTAMP(3) NOT NULL,
    "encerrada_em" TIMESTAMP(3),
    "motivo_encerramento" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "sessoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sso_tokens_usados" (
    "token_hash" TEXT NOT NULL,
    "usuario_id" TEXT,
    "usado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sso_tokens_usados_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "roval_sync_log" (
    "id" TEXT NOT NULL,
    "evento" TEXT NOT NULL,
    "codigo_funcionario" TEXT,
    "payload" JSONB NOT NULL,
    "resultado" "ResultadoSync" NOT NULL,
    "erro_msg" TEXT,
    "assinatura_ok" BOOLEAN NOT NULL,
    "chaves_ignoradas" TEXT[],
    "recebido_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roval_sync_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "ator_id" TEXT,
    "ator_nome" TEXT,
    "alvo" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lojas" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inativada_em" TIMESTAMP(3),

    CONSTRAINT "lojas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendedores" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "loja_id" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "admissao" DATE,
    "inativado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklists" (
    "id" TEXT NOT NULL,
    "tipo" "TipoModulo" NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_versoes" (
    "id" TEXT NOT NULL,
    "checklist_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "vigente_desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criada_por_id" TEXT,

    CONSTRAINT "checklist_versoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perguntas" (
    "id" TEXT NOT NULL,
    "versao_id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo_resposta" "TipoResposta" NOT NULL DEFAULT 'SIM_NAO',
    "peso" INTEGER NOT NULL,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "perguntas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitorias" (
    "id" TEXT NOT NULL,
    "tipo" "TipoModulo" NOT NULL,
    "vendedor_id" TEXT,
    "loja_id" TEXT NOT NULL,
    "canal" "CanalAtendimento",
    "data_referencia" TIMESTAMP(3) NOT NULL,
    "mes_ref" TEXT NOT NULL,
    "avaliador_id" TEXT NOT NULL,
    "versao_id" TEXT NOT NULL,
    "nota" DECIMAL(5,2) NOT NULL,
    "faixa" "Faixa" NOT NULL,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monitorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "respostas_monitoria" (
    "id" TEXT NOT NULL,
    "monitoria_id" TEXT NOT NULL,
    "pergunta_id" TEXT NOT NULL,
    "resposta" "RespostaCriterio" NOT NULL,
    "peso_efetivo" DECIMAL(7,4) NOT NULL,
    "pontos" DECIMAL(7,4) NOT NULL,

    CONSTRAINT "respostas_monitoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observacoes" (
    "id" TEXT NOT NULL,
    "monitoria_id" TEXT NOT NULL,
    "autor_id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parametros" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "excelente_min" INTEGER NOT NULL DEFAULT 90,
    "bom_min" INTEGER NOT NULL DEFAULT 75,
    "regular_min" INTEGER NOT NULL DEFAULT 60,
    "meta_base" INTEGER NOT NULL DEFAULT 1,
    "meta_regular" INTEGER NOT NULL DEFAULT 2,
    "meta_critico" INTEGER NOT NULL DEFAULT 3,
    "dia_alerta_fim_mes" INTEGER NOT NULL DEFAULT 20,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parametros_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_codigo_funcionario_key" ON "usuarios"("codigo_funcionario");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_username_key" ON "usuarios"("username");

-- CreateIndex
CREATE INDEX "usuarios_estado_idx" ON "usuarios"("estado");

-- CreateIndex
CREATE INDEX "usuario_permissoes_chave_idx" ON "usuario_permissoes"("chave");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_permissoes_usuario_id_chave_key" ON "usuario_permissoes"("usuario_id", "chave");

-- CreateIndex
CREATE UNIQUE INDEX "sessoes_token_hash_key" ON "sessoes"("token_hash");

-- CreateIndex
CREATE INDEX "sessoes_usuario_id_encerrada_em_idx" ON "sessoes"("usuario_id", "encerrada_em");

-- CreateIndex
CREATE INDEX "sessoes_expira_em_idx" ON "sessoes"("expira_em");

-- CreateIndex
CREATE INDEX "sso_tokens_usados_expira_em_idx" ON "sso_tokens_usados"("expira_em");

-- CreateIndex
CREATE INDEX "roval_sync_log_codigo_funcionario_recebido_em_idx" ON "roval_sync_log"("codigo_funcionario", "recebido_em");

-- CreateIndex
CREATE INDEX "audit_logs_acao_criado_em_idx" ON "audit_logs"("acao", "criado_em");

-- CreateIndex
CREATE INDEX "audit_logs_ator_id_criado_em_idx" ON "audit_logs"("ator_id", "criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "lojas_nome_key" ON "lojas"("nome");

-- CreateIndex
CREATE INDEX "vendedores_loja_id_ativo_idx" ON "vendedores"("loja_id", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "checklists_tipo_key" ON "checklists"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_versoes_checklist_id_numero_key" ON "checklist_versoes"("checklist_id", "numero");

-- CreateIndex
CREATE INDEX "perguntas_versao_id_ordem_idx" ON "perguntas"("versao_id", "ordem");

-- CreateIndex
CREATE INDEX "monitorias_tipo_mes_ref_idx" ON "monitorias"("tipo", "mes_ref");

-- CreateIndex
CREATE INDEX "monitorias_vendedor_id_data_referencia_idx" ON "monitorias"("vendedor_id", "data_referencia");

-- CreateIndex
CREATE INDEX "monitorias_loja_id_tipo_data_referencia_idx" ON "monitorias"("loja_id", "tipo", "data_referencia");

-- CreateIndex
CREATE UNIQUE INDEX "respostas_monitoria_monitoria_id_pergunta_id_key" ON "respostas_monitoria"("monitoria_id", "pergunta_id");

-- CreateIndex
CREATE INDEX "observacoes_monitoria_id_criada_em_idx" ON "observacoes"("monitoria_id", "criada_em");

-- AddForeignKey
ALTER TABLE "usuario_permissoes" ADD CONSTRAINT "usuario_permissoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendedores" ADD CONSTRAINT "vendedores_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_versoes" ADD CONSTRAINT "checklist_versoes_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "checklists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_versoes" ADD CONSTRAINT "checklist_versoes_criada_por_id_fkey" FOREIGN KEY ("criada_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perguntas" ADD CONSTRAINT "perguntas_versao_id_fkey" FOREIGN KEY ("versao_id") REFERENCES "checklist_versoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitorias" ADD CONSTRAINT "monitorias_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitorias" ADD CONSTRAINT "monitorias_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitorias" ADD CONSTRAINT "monitorias_avaliador_id_fkey" FOREIGN KEY ("avaliador_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitorias" ADD CONSTRAINT "monitorias_versao_id_fkey" FOREIGN KEY ("versao_id") REFERENCES "checklist_versoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respostas_monitoria" ADD CONSTRAINT "respostas_monitoria_monitoria_id_fkey" FOREIGN KEY ("monitoria_id") REFERENCES "monitorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respostas_monitoria" ADD CONSTRAINT "respostas_monitoria_pergunta_id_fkey" FOREIGN KEY ("pergunta_id") REFERENCES "perguntas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observacoes" ADD CONSTRAINT "observacoes_monitoria_id_fkey" FOREIGN KEY ("monitoria_id") REFERENCES "monitorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observacoes" ADD CONSTRAINT "observacoes_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- Regras que o banco garante sozinho (o Prisma não expressa estas).
-- ─────────────────────────────────────────────────────────────────────────────

-- Exatamente UM admin local: é nele que o superAdmin do hub é vinculado
-- (GUIA-INTEGRACAO §6.2). Um segundo registro com a marca seria um segundo
-- superadministrador concorrente.
CREATE UNIQUE INDEX "usuarios_um_admin_local" ON "usuarios" ("is_admin_local") WHERE "is_admin_local";

-- Parâmetros: linha única.
ALTER TABLE "parametros" ADD CONSTRAINT "parametros_linha_unica" CHECK ("id" = 1);

-- Pesos e notas dentro do domínio.
ALTER TABLE "perguntas" ADD CONSTRAINT "perguntas_peso_positivo" CHECK ("peso" > 0 AND "peso" <= 100);
ALTER TABLE "monitorias" ADD CONSTRAINT "monitorias_nota_0_100" CHECK ("nota" >= 0 AND "nota" <= 100);

-- Monitoria de vendedor tem vendedor e canal; monitoria de loja não tem nenhum dos dois.
ALTER TABLE "monitorias" ADD CONSTRAINT "monitorias_forma_por_tipo" CHECK (
  ("tipo" = 'VENDEDOR' AND "vendedor_id" IS NOT NULL AND "canal" IS NOT NULL)
  OR ("tipo" = 'LOJA' AND "vendedor_id" IS NULL AND "canal" IS NULL)
);

-- Uma só versão ativa por checklist.
CREATE UNIQUE INDEX "checklist_versoes_uma_ativa" ON "checklist_versoes" ("checklist_id") WHERE "ativa";

-- Trilhas imutáveis.
--   Regra 5: monitoria registrada não é excluída (nem suas respostas).
--   Regra 7: observação não é apagada nem editada — só complementada.
--   Auditoria: append-only.
-- Vale para a aplicação E para quem acessar o banco direto pelo pgAdmin.
CREATE FUNCTION "recusar_alteracao"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'A tabela % não permite % (trilha imutável da Monitoria de Qualidade).', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "monitorias_sem_exclusao" BEFORE DELETE ON "monitorias"
  FOR EACH ROW EXECUTE FUNCTION "recusar_alteracao"();
CREATE TRIGGER "respostas_imutaveis" BEFORE UPDATE OR DELETE ON "respostas_monitoria"
  FOR EACH ROW EXECUTE FUNCTION "recusar_alteracao"();
CREATE TRIGGER "observacoes_imutaveis" BEFORE UPDATE OR DELETE ON "observacoes"
  FOR EACH ROW EXECUTE FUNCTION "recusar_alteracao"();
CREATE TRIGGER "audit_logs_imutaveis" BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "recusar_alteracao"();

-- Nota e faixa congeladas no registro (regra 2): UPDATE só pode tocar o que não
-- muda o resultado. Retificação com trilha é Fase 2 e virá com rota própria.
CREATE FUNCTION "congelar_nota"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."nota" IS DISTINCT FROM OLD."nota"
     OR NEW."faixa" IS DISTINCT FROM OLD."faixa"
     OR NEW."versao_id" IS DISTINCT FROM OLD."versao_id" THEN
    RAISE EXCEPTION 'Nota, faixa e versão do checklist de uma monitoria são congeladas no registro.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "monitorias_nota_congelada" BEFORE UPDATE ON "monitorias"
  FOR EACH ROW EXECUTE FUNCTION "congelar_nota"();
