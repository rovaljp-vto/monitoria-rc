-- DropForeignKey
ALTER TABLE "imagens_observacao" DROP CONSTRAINT "imagens_observacao_observacao_id_fkey";

-- AlterTable
ALTER TABLE "imagens_observacao" ADD COLUMN     "feedback_id" TEXT,
ALTER COLUMN "observacao_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "imagens_observacao_feedback_id_idx" ON "imagens_observacao"("feedback_id");

-- AddForeignKey
ALTER TABLE "imagens_observacao" ADD CONSTRAINT "imagens_observacao_observacao_id_fkey" FOREIGN KEY ("observacao_id") REFERENCES "observacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imagens_observacao" ADD CONSTRAINT "imagens_observacao_feedback_id_fkey" FOREIGN KEY ("feedback_id") REFERENCES "feedbacks"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Cada imagem pertence a exatamente um dono: uma observação OU um feedback.
ALTER TABLE "imagens_observacao" ADD CONSTRAINT "imagens_observacao_um_dono"
  CHECK (("observacao_id" IS NULL) <> ("feedback_id" IS NULL));
