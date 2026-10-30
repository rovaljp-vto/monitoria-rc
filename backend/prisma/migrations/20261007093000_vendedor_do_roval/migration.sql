-- Vendedor replicado do RovalConnecta.
--
-- O hub passou a ser a fonte da verdade do cadastro de vendedores e do
-- histórico de lotação: envia `vendedor.upsert` / `vendedor.disable` para
-- /api/sync/users com a timeline inteira (semântica REPLACE). Todo vendedor
-- com cargo "Vendedor" no hub passa a existir aqui automaticamente,
-- disponível para monitoria.
--
-- `codigo_funcionario` é a chave de associação do contrato de integração
-- (GUIA-INTEGRACAO §2); `roval_managed` marca quem veio de lá, e nessas
-- linhas a tela de cadastros fica somente leitura.

ALTER TABLE "vendedores" ADD COLUMN "codigo_funcionario" TEXT;
ALTER TABLE "vendedores" ADD COLUMN "roval_user_id" TEXT;
ALTER TABLE "vendedores" ADD COLUMN "roval_managed" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "vendedores_codigo_funcionario_key" ON "vendedores"("codigo_funcionario");

-- Nomes canônicos das filiais, iguais aos do hub e do FAC (Matriz, Mag,
-- Epitácio, B2C, Altiplano). Sem isso o casamento loja↔filial dependeria de
-- uma tabela de equivalência, e cada filial nova exigiria editar código.
--
-- Condicional em cada UPDATE: a instalação pode já ter sido renomeada à mão,
-- e o nome é único — renomear para um nome já existente falharia.
UPDATE "lojas" SET "nome" = 'Matriz'
 WHERE "nome" = 'Pedro II'
   AND NOT EXISTS (SELECT 1 FROM "lojas" l2 WHERE l2."nome" = 'Matriz');

UPDATE "lojas" SET "nome" = 'Mag'
 WHERE "nome" = 'Mag Shopping'
   AND NOT EXISTS (SELECT 1 FROM "lojas" l2 WHERE l2."nome" = 'Mag');

UPDATE "lojas" SET "nome" = 'Altiplano'
 WHERE "nome" = 'Pátio Altiplano'
   AND NOT EXISTS (SELECT 1 FROM "lojas" l2 WHERE l2."nome" = 'Altiplano');
