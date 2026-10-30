-- Retificação (Fase 2, prevista na migration inicial): editar uma monitoria
-- finalizada cria OUTRA monitoria com as correções e um motivo obrigatório.
-- A original não é alterada nem apagada (as trilhas continuam imutáveis) —
-- ela apenas sai das estatísticas, apontada pela retificação.

ALTER TABLE "monitorias" ADD COLUMN "retifica_de_id" TEXT,
                         ADD COLUMN "motivo_retificacao" TEXT;

-- Uma retificação por monitoria; corrigir de novo retifica a retificação.
CREATE UNIQUE INDEX "monitorias_retifica_de_id_key" ON "monitorias"("retifica_de_id");

ALTER TABLE "monitorias" ADD CONSTRAINT "monitorias_retifica_de_id_fkey"
  FOREIGN KEY ("retifica_de_id") REFERENCES "monitorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Retificação sempre tem motivo; monitoria comum nunca tem.
ALTER TABLE "monitorias" ADD CONSTRAINT "monitorias_retificacao_com_motivo"
  CHECK (("retifica_de_id" IS NULL) = ("motivo_retificacao" IS NULL));
