-- CreateTable
CREATE TABLE "vendedor_loja_periodos" (
    "id" TEXT NOT NULL,
    "vendedor_id" TEXT NOT NULL,
    "loja_id" TEXT NOT NULL,
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE,
    "motivo" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendedor_loja_periodos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendedor_loja_periodos_vendedor_id_data_inicio_idx" ON "vendedor_loja_periodos"("vendedor_id", "data_inicio");

-- CreateIndex
CREATE INDEX "vendedor_loja_periodos_loja_id_data_inicio_idx" ON "vendedor_loja_periodos"("loja_id", "data_inicio");

-- AddForeignKey
ALTER TABLE "vendedor_loja_periodos" ADD CONSTRAINT "vendedor_loja_periodos_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendedor_loja_periodos" ADD CONSTRAINT "vendedor_loja_periodos_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Período coerente e no máximo UMA lotação aberta por vendedor.
ALTER TABLE "vendedor_loja_periodos" ADD CONSTRAINT "vendedor_loja_periodos_datas"
  CHECK ("data_fim" IS NULL OR "data_fim" >= "data_inicio");
CREATE UNIQUE INDEX "vendedor_loja_periodos_uma_aberta"
  ON "vendedor_loja_periodos" ("vendedor_id") WHERE "data_fim" IS NULL;

-- Vendedores que já existiam ganham a lotação inicial: a loja atual, desde a
-- admissão (ou, sem admissão, desde o cadastro). Para inativos, o período
-- fecha no dia da inativação.
INSERT INTO "vendedor_loja_periodos" ("id", "vendedor_id", "loja_id", "data_inicio", "data_fim")
SELECT gen_random_uuid()::text, v."id", v."loja_id",
       COALESCE(v."admissao", v."criado_em"::date),
       CASE WHEN v."ativo" THEN NULL ELSE GREATEST(COALESCE(v."inativado_em"::date, CURRENT_DATE), COALESCE(v."admissao", v."criado_em"::date)) END
FROM "vendedores" v
WHERE NOT EXISTS (SELECT 1 FROM "vendedor_loja_periodos" p WHERE p."vendedor_id" = v."id");
