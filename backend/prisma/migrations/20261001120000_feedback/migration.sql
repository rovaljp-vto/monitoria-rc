-- AlterTable
ALTER TABLE "respostas_monitoria" ADD COLUMN     "observacao" TEXT;

-- CreateTable
CREATE TABLE "feedbacks" (
    "id" TEXT NOT NULL,
    "monitoria_id" TEXT NOT NULL,
    "autor_id" TEXT NOT NULL,
    "autoavaliacao" INTEGER,
    "pontos_fortes" TEXT,
    "pontos_melhorar" TEXT,
    "combinados" TEXT,
    "realizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedbacks_monitoria_id_realizado_em_idx" ON "feedbacks"("monitoria_id", "realizado_em");

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_monitoria_id_fkey" FOREIGN KEY ("monitoria_id") REFERENCES "monitorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Autoavaliação na mesma escala da nota da monitoria.
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_autoavaliacao_0_100"
  CHECK ("autoavaliacao" IS NULL OR ("autoavaliacao" >= 0 AND "autoavaliacao" <= 100));

-- Feedback registrado não se edita nem se apaga — como as observações (regra 7).
CREATE TRIGGER "feedbacks_imutaveis" BEFORE UPDATE OR DELETE ON "feedbacks"
  FOR EACH ROW EXECUTE FUNCTION "recusar_alteracao"();
