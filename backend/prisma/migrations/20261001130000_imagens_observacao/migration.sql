-- CreateTable
CREATE TABLE "imagens_observacao" (
    "id" TEXT NOT NULL,
    "observacao_id" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "dados" BYTEA NOT NULL,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imagens_observacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imagens_observacao_observacao_id_idx" ON "imagens_observacao"("observacao_id");

-- AddForeignKey
ALTER TABLE "imagens_observacao" ADD CONSTRAINT "imagens_observacao_observacao_id_fkey" FOREIGN KEY ("observacao_id") REFERENCES "observacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Uma imagem por arquivo, com teto de 8 MB (o navegador já reduz antes de enviar).
ALTER TABLE "imagens_observacao" ADD CONSTRAINT "imagens_observacao_tamanho"
  CHECK ("tamanho" > 0 AND "tamanho" <= 8388608);
ALTER TABLE "imagens_observacao" ADD CONSTRAINT "imagens_observacao_mime"
  CHECK ("mime" IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif'));

-- Evidência registrada não se troca nem se apaga — como a observação (regra 7).
CREATE TRIGGER "imagens_observacao_imutaveis" BEFORE UPDATE OR DELETE ON "imagens_observacao"
  FOR EACH ROW EXECUTE FUNCTION "recusar_alteracao"();
