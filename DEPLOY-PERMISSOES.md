# DEPLOY — Gestão central de permissões (hub + nr1 + FAC)

> Roteiro para ativar em produção a atribuição centralizada de permissões
> granulares no RovalConnecta. O código já está pronto nos três sistemas —
> este documento é só a ordem de ativação.
>
> ⚠️ **A ORDEM IMPORTA.** O hub passa a enviar `permissions[]` nos webhooks e
> os satélites passam a aplicar (replace). Se um satélite for atualizado ANTES
> de o hub ser alimentado com o estado atual (Etapa 2), o primeiro sync de um
> usuário zera as permissões dele. Siga a sequência.

---

## Etapa 0 — Preparação (sem impacto; sistemas rodando)

**0.1 Exportar as permissões atuais dos satélites:**

```powershell
# nr1
cd d:\nr1\server
node export-permissions.js
# gera d:\nr1\server\nr1-permissions-export.json

# FAC
cd d:\FAC\client
node --env-file=.env --experimental-strip-types scripts/export-permissions.ts
# gera d:\FAC\client\fac-permissions-export.json
```

Abra os dois JSONs e confira por amostragem (3–5 pessoas conhecidas).

**0.2 Backup dos bancos:**

```powershell
pg_dump -U postgres -d <banco_do_hub>  -F c -f d:\backups\hub-pre-permissoes.dump
pg_dump -U postgres -d nr1survey       -F c -f d:\backups\nr1-pre-permissoes.dump
pg_dump -U postgres -d <banco_do_fac>  -F c -f d:\backups\fac-pre-permissoes.dump
```

**0.3 Guardar os builds atuais (rollback rápido):**

```powershell
Copy-Item d:\RovalConnectaJP-main\dist d:\backups\hub-dist-anterior -Recurse
Copy-Item d:\nr1\client\dist d:\backups\nr1-dist-anterior -Recurse
```

---

## Etapa 1 — Hub (RovalConnectaJP-main)

```powershell
cd d:\RovalConnectaJP-main
npm run build                     # frontend (gera /dist, servido pelo backend)

cd d:\RovalConnectaJP-main\backend
npx prisma migrate deploy         # aplica 20260714120000_add_central_permissions
npx prisma generate               # client Prisma com os modelos novos
npm run build                     # nest build
pm2 restart rovalconnecta-jp
```

**Verificar:**
- Painel abre normalmente; Admin → Usuários → Permissões mostra a seção nova
  "Permissões dentro de cada sistema" (catálogos ainda vazios — normal).
- nr1 e FAC continuam recebendo replicação normalmente (o campo novo é
  ignorado por eles até a Etapa 3/4). Cheque **Usuários → Replicação**: sem
  erros novos.

---

## Etapa 2 — Importar o estado atual para o hub (ANTES dos satélites!)

Use o **nome do módulo como está cadastrado no painel** (ou a rota, ou o id):

```powershell
cd d:\RovalConnectaJP-main\backend

# Simulação primeiro (--dry), confira a saída:
npx ts-node scripts/import-satellite-permissions.ts --module "NR1" --file d:\nr1\server\nr1-permissions-export.json --dry
npx ts-node scripts/import-satellite-permissions.ts --module "FAC" --file d:\FAC\client\fac-permissions-export.json --dry

# Depois pra valer:
npx ts-node scripts/import-satellite-permissions.ts --module "NR1" --file d:\nr1\server\nr1-permissions-export.json
npx ts-node scripts/import-satellite-permissions.ts --module "FAC" --file d:\FAC\client\fac-permissions-export.json
```

Usuários listados como "sem usuário no hub" são contas locais dos satélites —
normal; continuam gerenciadas localmente lá.

---

## Etapa 3 — nr1

```powershell
cd d:\nr1\client
npm run build

# reinicie o processo do servidor nr1 (node index.js) da forma como ele é
# gerenciado hoje (pm2 restart <nome> / serviço / janela dedicada)
```

**Verificar:**
- No hub, abra as permissões de um usuário com NR1 marcado → clique
  **"Atualizar catálogo"** → os 11 checkboxes do nr1 aparecem agrupados
  (Painel / Pesquisa / Planos de ação / Administradores).
- Marque/desmarque uma permissão e salve → no nr1, o usuário reflete a mudança
  em segundos (tela Admins). A tela do nr1 mostra o aviso "Gerenciado pelo
  RovalConnecta" para esse usuário.
- Crie um usuário de teste no hub com NR1 e só 2 permissões → no nr1 ele nasce
  com exatamente essas 2 (NÃO mais com todas).

---

## Etapa 4 — FAC

```powershell
cd d:\FAC\client
npm run build
pm2 restart fac
```

**Verificar:**
- No hub, "Atualizar catálogo" do FAC → checkboxes das permissões do FAC
  (as ativas da tabela `permissoes`).
- Alterar uma permissão no hub → refletir em /usuarios do FAC (toggles
  somente-leitura com o aviso).
- Teste sensível: conceder `financeiro:visualizar` no hub → valor de venda
  aparece nas ocorrências; revogar → volta a mascarar.

---

## Etapa 5 — Alinhamento final

1. **Backfill** (propaga o estado central pra todo mundo de uma vez):
   painel → Usuários → Replicação → backfill do NR1 e do FAC
   (ou `POST /integration/backfill/:moduleId`).
2. Conferir **Usuários → Replicação**: tudo `synced`.
3. Conferir 5 usuários por amostragem contra os JSONs da Etapa 0.
4. Auditoria do hub registra `user.permissions.update` e
   `integration.catalog.refresh` daqui em diante.

---

## Rollback

| Problema | Ação |
|---|---|
| Hub com erro após Etapa 1 | `pm2 restart` com o build anterior (d:\backups\hub-dist-anterior + dist do backend anterior). A migration é aditiva — não precisa reverter o banco. |
| Satélite aplicando permissões erradas | Reverta só o satélite (build anterior + restart). O payload volta a ser ignorado e as permissões locais valem. Restaure o dump se algo foi sobrescrito: `pg_restore -U postgres -d <banco> --clean d:\backups\<arquivo>.dump` |
| Import errado na Etapa 2 | Rode o import de novo com o JSON correto (semântica replace, idempotente). |

---

## Sistemas futuros

Receita completa em `backend/GUIA-INTEGRACAO-SISTEMAS.md`, seção 13
("Catálogo de permissões"): o sistema novo implementa `GET
/api/sync/permissions` + aplica `permissions[]` no upsert, e aparece sozinho
na tela central de permissões do hub. Mensagens (SmartFlow) e Dash-Lavinia
ficam de fora por enquanto (não têm login individual).
