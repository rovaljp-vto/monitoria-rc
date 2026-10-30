# Guia de Integração — Replicação automática de usuários

> Documento dirigido ao **desenvolvedor de cada sistema externo** que será
> integrado ao RovalConnecta. Aqui está tudo que você precisa saber e
> implementar para que os usuários cadastrados no RovalConnecta sejam
> automaticamente replicados no seu sistema.

---

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Glossário](#2-glossário)
3. [Eventos disparados pelo RovalConnecta](#3-eventos-disparados-pelo-rovalconnecta)
3-A. [Trilha de vendedor — cadastro e lotação](#3-a-trilha-de-vendedor-vendedorupsert--vendedordisable)
4. [Anatomia de um webhook](#4-anatomia-de-um-webhook)
5. [Validações obrigatórias](#5-validações-obrigatórias-segurança)
6. [Como tratar cada evento](#6-como-tratar-cada-evento-no-seu-sistema)
7. [Modelo de dados local sugerido](#7-modelo-de-dados-local-sugerido)
8. [Implementação completa em 3 linguagens](#8-implementação-completa)
9. [Configuração no RovalConnecta](#9-configuração-no-rovalconnecta-passo-a-passo)
10. [Como testar](#10-como-testar-checklist-de-smoke-tests)
11. [Troubleshooting](#11-troubleshooting)
12. [Checklist de produção](#12-checklist-de-produção)
13. [Catálogo de permissões — gestão central](#13-catálogo-de-permissões-gestão-central)

---

## 1. Visão geral

### O problema

Cada sistema interno da empresa hoje tem seu próprio cadastro de usuários.
Quando um colaborador novo entra, alguém precisa criá-lo manualmente em cada
sistema — TI, comunicados, chamados, NR-1, financeiro, etc. Isso gera:

- Trabalho manual repetitivo
- Inconsistências entre sistemas (nome diferente, código diferente)
- Risco de esquecer um sistema na hora de bloquear/excluir um colaborador

### A solução

O **RovalConnecta** vira a **fonte única da identidade** dos colaboradores.
Toda criação/edição/bloqueio/exclusão é feita lá, e o RovalConnecta envia
automaticamente um **webhook** (uma chamada HTTP POST autenticada) para todos
os sistemas externos cadastrados, mantendo-os sincronizados.

### Diagrama de alto nível

```
                           ┌──────────────────────────┐
   admin cria/edita        │                          │
       usuário             │      RovalConnecta       │
   ─────────────────────►  │   (fonte da verdade)     │
                           │                          │
                           └────────────┬─────────────┘
                                        │
                            POST /sync/users (HMAC)
                                        │
                  ┌─────────────────────┼─────────────────────┐
                  │                     │                     │
                  ▼                     ▼                     ▼
          ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
          │  Sistema A   │      │  Sistema B   │      │  Sistema C   │
          │ (Comunicados)│      │ (Chamados)   │      │ (NR-1, etc)  │
          └──────────────┘      └──────────────┘      └──────────────┘
```

Cada sistema externo expõe **um único endpoint HTTP** (ex.:
`POST /api/sync/users`) que recebe os eventos e atualiza seu cadastro local.

### O que NÃO é replicado

- ❌ **Senha** — cada sistema gerencia a própria senha local (mais sobre isso
  na seção 6.5)
- ❌ **Permissões/papéis específicos do sistema** — cada sistema decide
  internamente o que cada usuário pode fazer (única exceção: `superAdmin`,
  ver seção 6.2)
- ❌ **E-mail** — não é coletado no RovalConnecta

### O que É replicado

- ✅ **Identidade** — nome, código do funcionário, telefone, filial, setor
- ✅ **Status global** — ativo/bloqueado/excluído
- ✅ **Flag de super-admin** — `true` se o usuário é admin no Roval

---

## 2. Glossário

| Termo | Significado |
|---|---|
| **RovalConnecta** | Sistema central onde os usuários são cadastrados |
| **Sistema externo** | Qualquer sistema que recebe webhooks de sync (o seu) |
| **Webhook** | Chamada HTTP POST que o Roval faz para o seu endpoint |
| **HMAC** | Algoritmo que assina o conteúdo do webhook com um segredo compartilhado, garantindo autenticidade |
| **`syncUrl`** | URL do endpoint que **você** vai expor para receber os webhooks |
| **`syncSecret`** | Segredo HMAC compartilhado entre Roval e seu sistema (usado pra assinar/validar) |
| **`codigoFuncionario`** | Identificador estável do usuário (ex.: "0001"). Use isso pra encontrar o usuário no seu DB. |
| **`username`** | Nome de login no Roval. Padrão: `{codigoFuncionario}-{PRIMEIRO-NOME}` em maiúsculas (ex.: `0001-MARIA`) |
| **`superAdmin`** | Flag boolean. `true` quando o usuário é ADMIN no Roval. Indica que ele deve ter privilégio máximo no seu sistema. |
| **Admin local pré-existente** | O usuário admin que **já existia** no seu sistema antes da integração (criado durante o desenvolvimento, ex.: usuário `admin` ou `root` ou `master`) |
| **Backfill** | Processo de reenviar todos os usuários ativos para um sistema (útil ao integrar pela primeira vez ou após o sistema ficar offline) |

---

## 3. Eventos disparados pelo RovalConnecta

Existem **3 tipos** de evento. Você precisa tratar todos.

| Evento | Quando o Roval dispara | O que seu sistema deve fazer |
|---|---|---|
| **`user.upsert`** | Criação de usuário, ou edição de qualquer dado básico (nome/telefone/filial/setor/código), ou desbloqueio, ou mudança de role (admin↔colaborador) | Criar ou atualizar o usuário local com os dados recebidos. Ver lógica especial pra `superAdmin: true` na seção 6.2 |
| **`user.disable`** | Quando o admin bloqueia o usuário no Roval | Marcar o usuário local como **inativo** (não permitir login). Não excluir. |
| **`user.delete`** | Quando o admin exclui o usuário no Roval | Remover ou desativar permanentemente o usuário local. |

### Diagrama de sequência

```
admin no Roval                Roval                   seu sistema
       │                       │                          │
       │  cria usuário João    │                          │
       │──────────────────────►│                          │
       │                       │                          │
       │                       │  POST /api/sync/users   │
       │                       │  { event: "user.upsert", │
       │                       │    user: {...} }         │
       │                       │  HMAC: sha256=...        │
       │                       │─────────────────────────►│
       │                       │                          │
       │                       │      200 OK              │
       │                       │   { externalId: "..." }  │
       │                       │◄─────────────────────────│
       │                       │                          │
       │  ◄ usuário criado     │                          │
       │◄──────────────────────│                          │
```

> 💡 **Importante:** o webhook é **assíncrono** (fire-and-forget). Se seu
> endpoint demorar pra responder, o admin não percebe — a criação no Roval já
> retornou. Mas seu endpoint **deve responder em até 10 segundos** ou o Roval
> considera timeout e tenta de novo (até 3 vezes com backoff exponencial:
> 1s → 4s → 16s).

---

## 3-A. Trilha de VENDEDOR (`vendedor.upsert` / `vendedor.disable`)

> Implemente esta seção **apenas** se o seu sistema mantém um cadastro de
> VENDEDORES — gente que ele **analisa ou monitora**, e não necessariamente
> gente que faz login nele. Hoje é o caso do **FAC** e do **Checklist
> Comercial**. Nos demais satélites nada muda.

### Por que uma trilha separada

O RovalConnecta é a **fonte da verdade da lotação** (em que filial cada pessoa
está, e desde quando). Mandar isso junto com `user.upsert` não funcionaria:

1. **Vendedor não é usuário do satélite.** Os eventos `user.*` só vão para os
   sistemas que estão em `user.systems` — ou seja, aqueles cujo card a pessoa
   tem no hub. Nenhum dos vendedores tem o card do FAC nem do Checklist, então
   o cadastro deles nunca chegaria lá.
2. **O receptor não deve criar conta de acesso.** `user.upsert` mexe na tabela
   de usuários e nas permissões; `vendedor.upsert` só no cadastro de vendedores
   e no histórico de lotação.

A trilha é habilitada **por satélite** no hub (`SystemModule.syncVendedores`).
Satélite que não a entende nunca recebe esses eventos — por isso ela não quebra
nenhuma integração existente. O endpoint é o **mesmo** `syncUrl`, com a mesma
assinatura HMAC e as mesmas validações da seção 5.

| Evento | Quando o Roval dispara | O que seu sistema deve fazer |
|---|---|---|
| **`vendedor.upsert`** | Cadastro de alguém com cargo `Vendedor`; edição de nome/código/filial/cargo/status dessa pessoa; e **toda transferência de filial** (criada, corrigida ou desfeita) | Criar ou atualizar o vendedor local e **substituir o histórico de lotação** pelo que veio em `lotacoes` |
| **`vendedor.disable`** | A pessoa deixou de ser vendedora (mudou de cargo), foi desativada ou excluída no hub | **Inativar** o vendedor local. Não excluir: o evento também chega por mudança de cargo, e as análises/monitorias já lançadas precisam continuar existindo |

### Corpo da requisição

O sujeito vem em `vendedor` (e **não** em `user`):

```json
{
  "event": "vendedor.upsert",
  "vendedor": {
    "id": "a7f3...",
    "codigoFuncionario": "554",
    "nome": "Pamela Valério Dantas",
    "cargo": "Vendedor",
    "filial": "Mag",
    "ativo": true,
    "lotacoes": [
      { "filial": "Epitácio", "dataInicio": "1970-01-01", "dataFim": "2026-08-05", "motivo": "Backfill inicial" },
      { "filial": "Altiplano", "dataInicio": "2026-08-06", "dataFim": "2026-08-31", "motivo": null },
      { "filial": "Mag",       "dataInicio": "2026-09-01", "dataFim": null,         "motivo": null }
    ]
  },
  "timestamp": 1791394265
}
```

### Campos do `vendedor`

| Campo | Tipo | Observação |
|---|---|---|
| `id` | string (UUID) | ID do usuário no hub. Informativo — **não** use como chave. |
| `codigoFuncionario` | string | **Chave estável de associação.** Vendedor sem código não é replicado. |
| `nome` | string | Nome completo. Um apelido local (como o do FAC) não é sobrescrito. |
| `cargo` | string \| null | Cargo no hub. Quem decide ativo/inativo é o **evento**, não este campo. |
| `filial` | string \| null | Espelho da lotação aberta. Use quando `lotacoes` vier vazio. |
| `ativo` | boolean | Situação no hub. |
| `lotacoes` | array | Histórico **completo**, em ordem crescente de `dataInicio`. |

### Campos de cada `lotacao`

| Campo | Tipo | Observação |
|---|---|---|
| `filial` | string | Uma de: `Matriz`, `Mag`, `Epitácio`, `B2C`, `Altiplano`. Compare **sem acento e sem caixa** — e crie a filial se ela ainda não existir aí, em vez de recusar o webhook. |
| `dataInicio` | `YYYY-MM-DD` | Primeiro dia nessa filial, inclusivo. |
| `dataFim` | `YYYY-MM-DD` \| null | Último dia, inclusivo. **`null` = lotação atual.** |
| `motivo` | string \| null | Texto livre. |

### Como aplicar `lotacoes`

1. **Semântica REPLACE.** O conjunto recebido substitui o histórico local
   inteiro daquele vendedor. É o que mantém a operação idempotente: retry,
   backfill e reconciliação chegam ao mesmo estado.
2. **Compare antes de reescrever.** O hub replica o vendedor a cada edição de
   cadastro, e na maioria delas a lotação não mudou. Se o histórico local já é
   igual, não faça nada — evita churn de ids e de auditoria.
3. **Espelhe a lotação atual** no cadastro (`vendedores.filial_id` no FAC,
   `vendedores.loja_id` no Checklist), para as telas não precisarem consultar
   o histórico.
4. **Reancore o que já foi lançado.** Se o seu sistema guarda em que filial um
   registro aconteceu, realinhe-o ao histórico depois de aplicar: o registro
   conta na filial em que a pessoa estava **no dia** dele. É isso que faz uma
   transferência não reescrever os meses anteriores.
5. **Marque o cadastro como gerenciado** (`roval_managed`) e **trave a edição**
   dele na sua UI. Sem isso, uma transferência registrada no satélite seria
   desfeita pelo próximo webhook — silenciosamente, o que é pior do que
   recusar. Dados que o hub não tem (apelido, CPF, data de admissão) seguem
   locais e editáveis.

### Data `1970-01-01`

Marcador de **início desconhecido**, herdado do backfill original do FAC: a
data real daquela primeira lotação nunca foi registrada em lugar nenhum.
Guarde o valor como veio — inventar uma data fabricaria histórico — e exiba
algo como “desde o início” em vez de 01/01/1970.

### Reconciliação

`POST /integration/vendedores/reconcile` (no hub, como ADMIN) reenvia
`vendedor.upsert` para todos os vendedores atuais e `vendedor.disable` para
quem o hub sabe que o satélite conhece mas deixou de ser vendedor. É o
equivalente do backfill para esta trilha — use depois de subir uma versão nova
do receptor.

---

## 4. Anatomia de um webhook

### Request (o que chega no seu endpoint)

```http
POST /api/sync/users HTTP/1.1
Host: 192.168.1.x:porta
Content-Type: application/json
X-Roval-Signature: sha256=a1b2c3d4e5f6...
X-Roval-Timestamp: 1735680000

{
  "event": "user.upsert",
  "user": {
    "id": "9fedbd85-97c1-4855-a8b7-3558075c04a9",
    "nome": "Maria Silva",
    "username": "0001-MARIA",
    "codigoFuncionario": "0001",
    "telefone": "(83) 99999-9999",
    "filial": "Matriz",
    "setor": "TI",
    "cargo": "Farmacêutico",
    "ativo": true,
    "bloqueado": false,
    "superAdmin": false
  },
  "timestamp": 1735680000
}
```

### Headers

| Header | Obrigatório | Descrição |
|---|---|---|
| `Content-Type` | sim | Sempre `application/json` |
| `X-Roval-Signature` | sim | HMAC-SHA256 do body, formato `sha256=<hex>` |
| `X-Roval-Timestamp` | sim | Unix epoch em segundos (anti-replay) |

### Campos do `user`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string (UUID) | ID interno do Roval. Estável mas não use como chave primária no seu sistema — use `codigoFuncionario`. |
| `nome` | string | Nome completo do colaborador. |
| `username` | string | Login no Roval. Padrão: `{codigo}-{NOME}`. |
| `codigoFuncionario` | string \| null | **Identificador estável recomendado.** Use pra fazer lookup no seu DB. |
| `telefone` | string \| null | Telefone do colaborador. |
| `filial` | string \| null | Uma de: `Matriz`, `Mag Shopping`, `Eptácio`, `B2C`, `Altiplano` |
| `setor` | string \| null | Uma de: `Comercial`, `Administrativo`, `Estoque`, `Laboratório`, `RH`, `Financeiro`, `Consultoria`, `TI`, `Expedição`, `Loja` |
| `cargo` | string \| null | Cargo/função do colaborador. Lista controlada no painel (Assistente Comercial, Auxiliar Administrativo, Coordenador de Estoque, Farmacêutico, Gerente TI, etc.). Trate como texto livre — a lista pode crescer. |
| `ativo` | boolean | `false` em `user.delete` (pode ser ignorado, é redundante) |
| `bloqueado` | boolean | `true` em `user.disable` |
| `superAdmin` | boolean | **`true` se o usuário é ADMIN no Roval.** Ver seção 6.2 |
| `permissions` | string[] (opcional) | Permissões granulares do usuário NO SEU sistema (chaves do SEU catálogo — ver seção 13). Semântica **replace**: o conjunto enviado substitui o local. Só presente em `user.upsert` de não-superAdmin. |
| `permissionsManaged` | boolean (opcional) | `true` = o Roval é a fonte da verdade das permissões deste usuário. Aplique `permissions` e torne a edição local somente-leitura. Ausente em hubs antigos — nesse caso preserve as permissões locais. |

### Response esperada

| Status | Quando devolver | Body |
|---|---|---|
| `200` | Tudo certo, evento processado | `{ "externalId": "<id-local>" }` (recomendado) ou `{}` |
| `401` | Assinatura HMAC inválida | qualquer body |
| `400` | Timestamp expirado, ou JSON malformado | `{ "error": "..." }` |
| `5xx` | Erro interno (Roval vai tentar de novo) | `{ "error": "..." }` |

> 💡 **Devolver `externalId`** é opcional mas recomendado: o Roval guarda esse
> ID na tabela `UserSyncStatus` pra diagnóstico. O admin consegue ver no
> painel "qual ID esse usuário tem em cada sistema".

---

## 5. Validações obrigatórias (segurança)

### 5.1 — Validação HMAC (autenticidade)

**Por quê:** garante que o webhook veio mesmo do RovalConnecta e não foi
adulterado. Sem essa validação, qualquer pessoa na rede poderia mandar
requisições falsificando criação de usuários.

**Como:**

1. Pegar o body **cru** da requisição (bytes) — **NÃO** o JSON parseado
2. Calcular `HMAC-SHA256(syncSecret, body_bytes)` → hex string
3. Comparar com o valor recebido no header `X-Roval-Signature`
   (após remover o prefixo `sha256=`)
4. **Use comparação resistente a timing** (`timing-safe equal`)

> ⚠️ **Cuidado:** em frameworks que parseiam o body automaticamente (ex.:
> Express com `app.use(express.json())`), o JSON é serializado de novo
> e a string pode mudar (ordem de campos, espaçamento). **Você precisa
> pegar o body antes do parser**, mantendo os bytes originais.

**Exemplo conceitual:**

```javascript
const expected = "sha256=" + hmacSha256(secret, rawBodyBytes);
if (!timingSafeEqual(expected, header)) {
  return 401;
}
```

### 5.2 — Validação de timestamp (anti-replay)

**Por quê:** mesmo com HMAC, alguém poderia capturar um webhook válido e
reenviá-lo (replay attack). O timestamp + janela curta evita isso.

**Como:**

1. Ler o header `X-Roval-Timestamp` (unix seconds)
2. Comparar com o tempo atual: `|now_seconds - timestamp| <= 300` (5 minutos)
3. Se diferença for maior, devolver `400`

```javascript
if (Math.abs(Date.now() / 1000 - timestamp) > 300) return 400;
```

### 5.3 — Resumo do fluxo de validação

```
recebeu request
      │
      ▼
   timestamp ok?  ──não──► 400 timestamp expired
      │
      sim
      ▼
   HMAC ok?       ──não──► 401 invalid signature
      │
      sim
      ▼
   processa evento
      │
      ▼
   200 { externalId }
```

---

## 6. Como tratar cada evento no seu sistema

### 6.1 — `user.upsert` com `superAdmin: false` (colaborador comum)

**Cenário:** colaborador novo foi criado no Roval, ou tiveram seus dados
editados.

**O que fazer:**

```pseudo
function on_user_upsert(user) {
  if (user.superAdmin) { /* ver 6.2 */ return }

  let local = db.findOne(WHERE codigoFuncionario = user.codigoFuncionario)

  if (local existe) {
    // Atualizar dados
    local.nome = user.nome
    local.telefone = user.telefone
    local.filial = user.filial
    local.setor = user.setor
    local.ativo = user.ativo && !user.bloqueado
    db.save(local)
  } else {
    // Criar novo — IMPORTANTE: sem permissões, sem papel, INATIVO
    let novo = {
      codigoFuncionario: user.codigoFuncionario,
      nome: user.nome,
      username: user.username,
      telefone: user.telefone,
      filial: user.filial,
      setor: user.setor,
      ativo: false,                  // ← admin local precisa ativar manualmente
      role: "pendente",              // ou "sem_papel" — definir nome no seu sistema
      origem: "roval",
      criadoEm: now()
    }
    db.insert(novo)
    local = novo
  }

  return { externalId: local.id }
}
```

**⚠️ Importante:** o usuário **não deve** ser criado já com permissões. O
admin local do seu sistema precisa visitar o painel, ativar o usuário e
atribuir as permissões/papéis específicos do seu sistema.

### 6.2 — `user.upsert` com `superAdmin: true` (vínculo com admin local)

**Cenário:** usuário tem perfil ADMIN no Roval. Como você só tem **um** admin
local (criado durante o desenvolvimento do seu sistema), o ideal é
**vincular** o admin do Roval ao admin local **existente** — em vez de criar
um novo super-admin.

**O que fazer:**

```pseudo
function on_user_upsert(user) {
  if (!user.superAdmin) { /* ver 6.1 */ return }

  // Busca o admin local pré-existente. Adapte a query conforme seu sistema.
  let adminLocal = db.findOne(WHERE role = "admin" LIMIT 1)
  // ...ou WHERE username = "admin", ou whatever identifica o admin do seu sistema

  if (adminLocal não existe) {
    // Caso raro — sistema sem admin pré-criado.
    // Pode optar por criar um, mas o normal é todo sistema ter o seu.
    log.warn("Admin local não encontrado!")
    return error
  }

  // Atualiza/marca o admin local com os dados do Roval
  adminLocal.nomeRoval = user.nome
  adminLocal.codigoFuncionarioRoval = user.codigoFuncionario
  adminLocal.usernameRoval = user.username
  adminLocal.linkedToRoval = true
  adminLocal.lastSyncAt = now()
  db.save(adminLocal)

  // IMPORTANTE: devolve o ID do admin LOCAL — não cria novo usuário
  return { externalId: adminLocal.id }
}
```

**Por que vincular em vez de criar novo:**

- Mantém **um único super-admin** no seu sistema (mais seguro)
- Quando o admin do Roval entrar via SSO (futuro), entra **como** o admin
  local existente — herda todos os dados/configurações
- Evita ter "vários admins concorrentes"

### 6.3 — Comportamento simétrico: rebaixamento

**Cenário:** o admin do Roval foi rebaixado para colaborador. Vai chegar
`user.upsert` com `superAdmin: false` para o mesmo `codigoFuncionario` que
antes vinha com `superAdmin: true`.

**O que fazer:**

```pseudo
function on_user_upsert(user) {
  if (user.superAdmin) {
    // vincula ao admin local (6.2)
    ...
  } else {
    // Antes era admin? então desvincula:
    let adminLocal = db.findOne(WHERE codigoFuncionarioRoval = user.codigoFuncionario AND role = "admin")
    if (adminLocal existe) {
      // mantém o admin local intacto (não excluir! ele é o admin do seu sistema)
      adminLocal.linkedToRoval = false
      adminLocal.codigoFuncionarioRoval = null
      adminLocal.nomeRoval = null
      db.save(adminLocal)
    }

    // Cria/atualiza um usuário comum com os dados do Roval (agora colaborador)
    /* lógica do 6.1 */
  }
}
```

> 💡 Isso garante que se um admin do Roval for rebaixado, ele perde os poderes
> admin em todos os sistemas externos automaticamente — mas o admin local do
> seu sistema continua existindo e funcionando.

### 6.4 — `user.disable` (bloqueio)

**Cenário:** o admin bloqueou o usuário no Roval. Ele não deve mais conseguir
fazer login no seu sistema.

**O que fazer:**

```pseudo
function on_user_disable(user) {
  let local = db.findOne(WHERE codigoFuncionario = user.codigoFuncionario)
  if (local existe) {
    local.ativo = false
    local.bloqueadoEm = now()
    local.bloqueadoPor = "roval-sync"
    db.save(local)
  }
  return { externalId: local?.id }
}
```

### 6.5 — `user.delete` (exclusão)

**Cenário:** o admin excluiu o usuário no Roval.

**O que fazer (depende da política do seu sistema):**

| Política | O que fazer |
|---|---|
| **Hard-delete** | Remove fisicamente o registro do banco. Bom pra LGPD/compliance, ruim pra auditoria. |
| **Soft-delete** | Marca como excluído (`deletedAt = now()`) mas mantém o registro. Bom pra auditoria. |
| **Anonimizar** | Mantém o registro mas troca nome/dados pessoais por strings genéricas. Compliance + auditoria. |

```pseudo
function on_user_delete(user) {
  let local = db.findOne(WHERE codigoFuncionario = user.codigoFuncionario)
  if (local existe) {
    // exemplo: anonimizar
    local.nome = "[Excluído]"
    local.telefone = null
    local.deletedAt = now()
    db.save(local)
  }
}
```

### 6.6 — Política de senha local

O Roval **nunca envia senha**. Cada sistema externo decide:

| Estratégia | Como funciona | Quando escolher |
|---|---|---|
| **A. Senha temporária** | Sistema gera senha aleatória + flag "trocar no primeiro login". Admin local comunica ao usuário. | Sistemas com poucos usuários, admin pode comunicar |
| **B. Link de "definir senha"** | Sistema gera token único + URL `/setup-senha/<token>`. Comunica via canal externo (papel, sistema de mensagens, etc) | Sistemas com muitos usuários ou auto-serviço |
| **C. Login externo (SSO futuro)** | Senha local não é necessária — usuário só entra via SSO do Roval | Quando o SSO estiver implementado |

**Recomendação:** começar com **A**, evoluir pra **B**, e migrar pra **C**
quando o SSO estiver pronto.

---

## 7. Modelo de dados local sugerido

### Adições à tabela de usuários do seu sistema

Sugestão de campos a adicionar (nomes só sugestivos):

```sql
ALTER TABLE users ADD COLUMN codigo_funcionario VARCHAR(50) UNIQUE;
ALTER TABLE users ADD COLUMN username_roval     VARCHAR(100);
ALTER TABLE users ADD COLUMN nome_roval         VARCHAR(255);
ALTER TABLE users ADD COLUMN linked_to_roval    BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN last_roval_sync_at TIMESTAMP;
ALTER TABLE users ADD COLUMN origem_cadastro    VARCHAR(20);  -- "roval" | "local" | "manual"
ALTER TABLE users ADD COLUMN telefone           VARCHAR(20);
ALTER TABLE users ADD COLUMN filial             VARCHAR(50);
ALTER TABLE users ADD COLUMN setor              VARCHAR(50);
```

### Tabela auxiliar de auditoria de sync (opcional mas recomendada)

Pra você conseguir investigar problemas:

```sql
CREATE TABLE roval_sync_log (
  id              SERIAL PRIMARY KEY,
  evento          VARCHAR(20) NOT NULL,   -- 'user.upsert' | 'user.disable' | 'user.delete'
  codigo_func     VARCHAR(50),
  payload         JSONB NOT NULL,
  resultado       VARCHAR(20),            -- 'ok' | 'erro'
  erro_msg        TEXT,
  signature_ok    BOOLEAN,
  recebido_em     TIMESTAMP DEFAULT now()
);
CREATE INDEX ON roval_sync_log (codigo_func, recebido_em);
```

Toda vez que receber um webhook, registre — facilita o debug em produção.

---

## 8. Implementação completa

### 8.1 — Node.js + Express

```javascript
// sync-handler.js
import express from "express";
import { createHmac, timingSafeEqual } from "crypto";

const router = express.Router();
const SYNC_SECRET = process.env.ROVAL_SYNC_SECRET; // configure via env var

// IMPORTANTE: receber o body como buffer cru, ANTES de qualquer JSON parser
router.post(
  "/api/sync/users",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sigHeader = String(req.headers["x-roval-signature"] ?? "");
    const tsHeader = Number(req.headers["x-roval-timestamp"] ?? 0);

    // 1. Anti-replay
    if (Math.abs(Date.now() / 1000 - tsHeader) > 300) {
      return res.status(400).json({ error: "timestamp expired" });
    }

    // 2. Validação HMAC
    const expected = createHmac("sha256", SYNC_SECRET)
      .update(req.body) // req.body é Buffer cru
      .digest("hex");
    const provided = sigHeader.startsWith("sha256=")
      ? sigHeader.slice(7)
      : sigHeader;

    if (
      provided.length !== expected.length ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
    ) {
      return res.status(401).json({ error: "invalid signature" });
    }

    // 3. Parse e processa
    let payload;
    try {
      payload = JSON.parse(req.body.toString("utf8"));
    } catch {
      return res.status(400).json({ error: "invalid json" });
    }

    const { event, user } = payload;
    if (!event || !user) {
      return res.status(400).json({ error: "missing event/user" });
    }

    try {
      let externalId;
      switch (event) {
        case "user.upsert":
          externalId = await handleUpsert(user);
          break;
        case "user.disable":
          externalId = await handleDisable(user);
          break;
        case "user.delete":
          externalId = await handleDelete(user);
          break;
        default:
          return res.status(400).json({ error: "unknown event" });
      }
      return res.json({ externalId });
    } catch (err) {
      console.error("sync error:", err);
      return res.status(500).json({ error: "internal error" });
    }
  }
);

// ---------- handlers (adapte ao seu DB) ----------

async function handleUpsert(user) {
  if (user.superAdmin) {
    // Vincular ao admin local pré-existente
    const adminLocal = await db.users.findFirst({ where: { role: "admin" } });
    if (!adminLocal) throw new Error("Admin local não encontrado");
    await db.users.update({
      where: { id: adminLocal.id },
      data: {
        nomeRoval: user.nome,
        codigoFuncionarioRoval: user.codigoFuncionario,
        usernameRoval: user.username,
        linkedToRoval: true,
        lastRovalSyncAt: new Date(),
      },
    });
    return adminLocal.id;
  }

  // Não é super-admin: cria/atualiza colaborador
  const existing = await db.users.findFirst({
    where: { codigoFuncionario: user.codigoFuncionario },
  });
  const data = {
    nome: user.nome,
    username: user.username,
    codigoFuncionario: user.codigoFuncionario,
    telefone: user.telefone,
    filial: user.filial,
    setor: user.setor,
    ativo: user.ativo && !user.bloqueado,
    origem: "roval",
    lastRovalSyncAt: new Date(),
  };
  if (existing) {
    await db.users.update({ where: { id: existing.id }, data });
    return existing.id;
  }
  const created = await db.users.create({
    data: { ...data, role: "pendente", senha: null }, // senha nula = login bloqueado até definir
  });
  return created.id;
}

async function handleDisable(user) {
  const u = await db.users.findFirst({
    where: { codigoFuncionario: user.codigoFuncionario },
  });
  if (u) {
    await db.users.update({
      where: { id: u.id },
      data: { ativo: false, bloqueadoEm: new Date() },
    });
    return u.id;
  }
  return null;
}

async function handleDelete(user) {
  const u = await db.users.findFirst({
    where: { codigoFuncionario: user.codigoFuncionario },
  });
  if (u) {
    // Anonimizar (escolha sua política):
    await db.users.update({
      where: { id: u.id },
      data: {
        nome: "[Excluído]",
        telefone: null,
        ativo: false,
        deletedAt: new Date(),
      },
    });
    return u.id;
  }
  return null;
}

export default router;
```

### 8.2 — PHP nativo

```php
<?php
// sync-handler.php
$SYNC_SECRET = getenv("ROVAL_SYNC_SECRET");

// 1. Lê o body cru (antes de qualquer parser)
$body = file_get_contents("php://input");
$sigHeader = $_SERVER["HTTP_X_ROVAL_SIGNATURE"] ?? "";
$ts = (int) ($_SERVER["HTTP_X_ROVAL_TIMESTAMP"] ?? 0);

// 2. Anti-replay
if (abs(time() - $ts) > 300) {
    http_response_code(400);
    echo json_encode(["error" => "timestamp expired"]);
    exit;
}

// 3. Validação HMAC
$expected = "sha256=" . hash_hmac("sha256", $body, $SYNC_SECRET);
if (!hash_equals($expected, $sigHeader)) {
    http_response_code(401);
    echo json_encode(["error" => "invalid signature"]);
    exit;
}

// 4. Parse e processa
$payload = json_decode($body, true);
if (!$payload || !isset($payload["event"], $payload["user"])) {
    http_response_code(400);
    echo json_encode(["error" => "invalid payload"]);
    exit;
}

$event = $payload["event"];
$user = $payload["user"];
$pdo = getPDO(); // sua conexão

try {
    switch ($event) {
        case "user.upsert":
            $externalId = handleUpsert($pdo, $user);
            break;
        case "user.disable":
            $externalId = handleDisable($pdo, $user);
            break;
        case "user.delete":
            $externalId = handleDelete($pdo, $user);
            break;
        default:
            http_response_code(400);
            echo json_encode(["error" => "unknown event"]);
            exit;
    }
    echo json_encode(["externalId" => $externalId]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["error" => $e->getMessage()]);
}

// ---------- handlers ----------

function handleUpsert(PDO $pdo, array $user): ?string {
    if (!empty($user["superAdmin"])) {
        // Vincula ao admin local
        $stmt = $pdo->query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
        $adminId = $stmt->fetchColumn();
        if (!$adminId) throw new Exception("Admin local não encontrado");
        $upd = $pdo->prepare(
            "UPDATE users SET
                nome_roval = :nome,
                codigo_funcionario_roval = :cod,
                username_roval = :user,
                linked_to_roval = true,
                last_roval_sync_at = NOW()
             WHERE id = :id"
        );
        $upd->execute([
            ":nome" => $user["nome"],
            ":cod" => $user["codigoFuncionario"],
            ":user" => $user["username"],
            ":id" => $adminId,
        ]);
        return (string)$adminId;
    }

    // Colaborador comum
    $stmt = $pdo->prepare("SELECT id FROM users WHERE codigo_funcionario = ?");
    $stmt->execute([$user["codigoFuncionario"]]);
    $id = $stmt->fetchColumn();

    if ($id) {
        $upd = $pdo->prepare(
            "UPDATE users SET nome=?, telefone=?, filial=?, setor=?, ativo=?, last_roval_sync_at=NOW() WHERE id=?"
        );
        $upd->execute([
            $user["nome"],
            $user["telefone"],
            $user["filial"],
            $user["setor"],
            $user["ativo"] && !$user["bloqueado"] ? 1 : 0,
            $id,
        ]);
        return (string)$id;
    }

    // Cria novo
    $ins = $pdo->prepare(
        "INSERT INTO users (codigo_funcionario, nome, username, telefone, filial, setor, ativo, role, origem)
         VALUES (?, ?, ?, ?, ?, ?, false, 'pendente', 'roval')"
    );
    $ins->execute([
        $user["codigoFuncionario"],
        $user["nome"],
        $user["username"],
        $user["telefone"],
        $user["filial"],
        $user["setor"],
    ]);
    return (string)$pdo->lastInsertId();
}

function handleDisable(PDO $pdo, array $user): ?string {
    $upd = $pdo->prepare("UPDATE users SET ativo=false, bloqueado_em=NOW() WHERE codigo_funcionario=?");
    $upd->execute([$user["codigoFuncionario"]]);
    return null;
}

function handleDelete(PDO $pdo, array $user): ?string {
    $upd = $pdo->prepare(
        "UPDATE users SET nome='[Excluído]', telefone=NULL, ativo=false, deleted_at=NOW() WHERE codigo_funcionario=?"
    );
    $upd->execute([$user["codigoFuncionario"]]);
    return null;
}
```

### 8.3 — Python + Flask

```python
# sync_handler.py
import hashlib
import hmac
import os
import time
from flask import Blueprint, request, jsonify

bp = Blueprint("sync", __name__)
SYNC_SECRET = os.environ["ROVAL_SYNC_SECRET"].encode()

@bp.post("/api/sync/users")
def sync_users():
    body = request.get_data()  # raw bytes
    sig_header = request.headers.get("X-Roval-Signature", "")
    ts = int(request.headers.get("X-Roval-Timestamp", "0"))

    # 1. Anti-replay
    if abs(time.time() - ts) > 300:
        return jsonify(error="timestamp expired"), 400

    # 2. HMAC
    expected = "sha256=" + hmac.new(SYNC_SECRET, body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig_header):
        return jsonify(error="invalid signature"), 401

    # 3. Parse e processa
    payload = request.get_json(silent=True)
    if not payload or "event" not in payload or "user" not in payload:
        return jsonify(error="invalid payload"), 400

    event = payload["event"]
    user = payload["user"]

    try:
        if event == "user.upsert":
            external_id = handle_upsert(user)
        elif event == "user.disable":
            external_id = handle_disable(user)
        elif event == "user.delete":
            external_id = handle_delete(user)
        else:
            return jsonify(error="unknown event"), 400
        return jsonify(externalId=external_id)
    except Exception as e:
        return jsonify(error=str(e)), 500


def handle_upsert(user):
    if user.get("superAdmin"):
        # Vincula ao admin local
        admin = db.users.find_one(role="admin")
        if not admin:
            raise Exception("Admin local não encontrado")
        db.users.update(admin["id"], {
            "nome_roval": user["nome"],
            "codigo_funcionario_roval": user["codigoFuncionario"],
            "username_roval": user["username"],
            "linked_to_roval": True,
            "last_roval_sync_at": now(),
        })
        return str(admin["id"])

    existing = db.users.find_one(codigo_funcionario=user["codigoFuncionario"])
    data = {
        "nome": user["nome"],
        "telefone": user.get("telefone"),
        "filial": user.get("filial"),
        "setor": user.get("setor"),
        "ativo": user["ativo"] and not user["bloqueado"],
        "last_roval_sync_at": now(),
    }
    if existing:
        db.users.update(existing["id"], data)
        return str(existing["id"])
    new_id = db.users.insert({
        **data,
        "codigo_funcionario": user["codigoFuncionario"],
        "username": user["username"],
        "role": "pendente",
        "origem": "roval",
        "ativo": False,
    })
    return str(new_id)


def handle_disable(user):
    db.users.update_where(
        {"codigo_funcionario": user["codigoFuncionario"]},
        {"ativo": False, "bloqueado_em": now()},
    )
    return None


def handle_delete(user):
    db.users.update_where(
        {"codigo_funcionario": user["codigoFuncionario"]},
        {"nome": "[Excluído]", "telefone": None, "ativo": False, "deleted_at": now()},
    )
    return None
```

---

## 9. Configuração no RovalConnecta (passo a passo)

Depois que seu endpoint está pronto e testado, configure no Roval:

1. **Login** como admin (`admin` / sua senha) no RovalConnecta
2. Sidebar → **Gestão de Sistemas**
3. Clique **Novo sistema** (ou edite um existente)
4. Preencha os campos comuns:
   - **Nome:** ex. `Sistema de Chamados`
   - **Descrição:** descrição curta
   - **Rota:** ex. `http://192.168.1.10:8080` (URL pra abrir o card) ou rota interna `/chamados`
   - **Ícone:** escolha um
   - **Protegido:** ✅ marcado (obrigatório pra replicação)
   - **Perfis padrão com acesso:** quais roles do Roval vão ver o card
5. Role até **"Replicação automática de usuário"**:
   - **URL de sincronização:** a URL do seu endpoint
     (ex. `http://192.168.1.10:8080/api/sync/users`)
   - **Segredo HMAC:** clique **Gerar** (cria 32 bytes hex). Copie e cole na
     variável de ambiente `ROVAL_SYNC_SECRET` do seu sistema.
6. Salvar

> 💡 Quando você cria um sistema novo com replicação ativa, o Roval dispara
> automaticamente um **backfill** — manda `user.upsert` pra todos os usuários
> ativos. Você verá no log do seu sistema cada usuário chegando.

> 💡 Se precisar resincronizar manualmente (ex.: depois do seu sistema ficar
> offline e voltar), use o botão **Sincronizar todos** dentro do editor do
> sistema, ou chame `POST /integration/backfill/<moduleId>` (autenticado como admin).

---

## 10. Como testar (checklist de smoke tests)

Use o servidor de exemplo (`backend/scripts/example-external-sync-server.ts`)
ou seu próprio sistema. Cenários a validar:

### 10.1 — Assinatura inválida → 401

```bash
curl -X POST http://seu-sistema/api/sync/users \
  -H "Content-Type: application/json" \
  -H "X-Roval-Signature: sha256=ASSINATURAERRADA" \
  -H "X-Roval-Timestamp: $(date +%s)" \
  -d '{"event":"user.upsert","user":{"id":"x","nome":"X","username":"x","codigoFuncionario":"1","telefone":null,"filial":null,"setor":null,"ativo":true,"bloqueado":false,"superAdmin":false},"timestamp":'$(date +%s)'}'
# esperado: 401
```

### 10.2 — Timestamp expirado → 400

```bash
# Use timestamp de 1 hora atrás
TS=$(($(date +%s) - 3600))
# ... mesma request com X-Roval-Timestamp: $TS
# esperado: 400
```

### 10.3 — Criar colaborador via Roval → upsert chega

1. No Roval: Criar Usuário → preenche dados → salvar
2. No log do seu sistema: `user.upsert` recebido com HMAC válido
3. No banco do seu sistema: novo usuário, papel "pendente", inativo

### 10.4 — Vincular admin do Roval ao admin local

1. No Roval: certifica que o usuário admin (`admin`) está ativo
2. Acionar backfill (criar sistema novo OU clicar "Sincronizar todos")
3. No log do seu sistema: `user.upsert` com `superAdmin: true`
4. No banco: o admin **local pré-existente** ganhou os campos `nome_roval`,
   `codigo_funcionario_roval`, `linked_to_roval=true`
5. **Não foi criado** um novo usuário — confirma que só o admin local existente
   foi atualizado

### 10.5 — Bloquear → disable chega

1. No Roval: clica em Bloquear no usuário criado
2. Log: `user.disable`
3. Banco: usuário marcado como inativo

### 10.6 — Excluir → delete chega

1. No Roval: clica em Excluir
2. Log: `user.delete`
3. Banco: usuário com `nome="[Excluído]"` e `deleted_at` preenchido

### 10.7 — Roval offline → retry funciona

1. **Pare** seu sistema externo (mate o processo)
2. No Roval: cria/edita um usuário
3. No painel do Roval (Usuários → coluna Replicação): chip vermelho aparece após ~25 segundos (3 retries × backoff)
4. **Inicie** seu sistema de novo
5. No painel: clique no chip → **Reenviar** → status volta pra verde

---

## 11. Troubleshooting

### "401 Unauthorized" / Assinatura inválida em todo webhook

**Causa mais comum:** o body foi modificado pelo seu framework antes da
validação HMAC. Frameworks como Express com `app.use(express.json())` parseiam
e re-serializam o JSON, mudando bytes (espaços, ordem de chaves).

**Solução:** registrar o middleware `express.raw({ type: "application/json" })`
**específico** pra essa rota. Em PHP isso não acontece (você lê
`php://input` direto). Em Python+Flask, usar `request.get_data()` antes de
`request.get_json()`.

### "400 timestamp expired" sempre

**Causa:** relógios desincronizados entre o servidor do Roval e o seu
sistema. NTP é importante.

**Solução:** ative NTP em ambos os servidores. Janela permitida: 5 minutos.

### Webhook não chega no meu sistema

Possíveis causas:

1. **Sistema não está marcado como `protegido: true` no Roval** → na UI de
   Gestão de Sistemas, marque o switch "Protegido"
2. **`syncUrl` ou `syncSecret` não estão configurados** → confira no editor
3. **Firewall bloqueando** → testa com `curl http://seu-sistema/api/sync/users`
   da máquina onde o Roval roda. Se não responder, é firewall.
4. **Sistema externo está offline** → o Roval registra `error` em
   `UserSyncStatus` e o admin pode reenviar manualmente

### Admin local virou "duplicado" (apareceram 2 admins no meu sistema)

**Causa:** seu handler `handleUpsert` criou um novo super-admin em vez de
vincular ao admin local pré-existente quando `superAdmin: true`.

**Solução:** revisar a seção 6.2 — em vez de criar usuário novo, fazer
`UPDATE` no admin local existente.

### Status fica "pending" eternamente

**Causa:** seu endpoint não está respondendo nada (timeout) ou está
respondendo demais (>10 segundos).

**Solução:** seu handler deve responder em até 10s. Para operações lentas,
faça async — devolve 200 imediatamente e processa em background.

---

## 12. Checklist de produção

Antes de marcar como "pronto":

- [ ] Endpoint `/api/sync/users` respondendo `200` em menos de 10s
- [ ] HMAC validado **antes** de parsear o body
- [ ] Timestamp validado (5 min de janela)
- [ ] `superAdmin: true` **vincula** ao admin local existente, não cria novo
- [ ] `superAdmin: false` em ex-admin: desvincula sem destruir o admin local
- [ ] Colaborador novo é criado **inativo** e **sem permissões**
- [ ] `user.disable` marca como inativo
- [ ] `user.delete` segue a política do sistema (hard, soft ou anonimizar)
- [ ] Senha local NÃO depende do Roval (estratégia A, B ou C definida)
- [ ] `ROVAL_SYNC_SECRET` está em variável de ambiente, **não commitado** no Git
- [ ] Logs de cada webhook recebido (sucesso e falha)
- [ ] Tabela auxiliar `roval_sync_log` (ou similar) ativa
- [ ] NTP configurado no servidor
- [ ] HTTPS quando estiver fora da LAN interna

---

## 13. Catálogo de permissões — gestão central

> A partir de jul/2026 o RovalConnecta é o lugar ÚNICO onde as permissões
> granulares dos usuários são atribuídas. O admin marca os checkboxes na tela
> **Admin → Usuários → Permissões** e o hub replica para o seu sistema no
> campo `permissions` do `user.upsert`. Para participar, seu sistema precisa
> de DUAS coisas: publicar o catálogo (13.1) e aplicar o conjunto recebido (13.2).

### 13.1 — Publique seu catálogo: `GET /api/sync/permissions`

O hub consulta este endpoint (no MESMO host do `syncUrl`) pra saber quais
permissões existem no seu sistema e montar os checkboxes.

**Autenticação** — como GET não tem body, a assinatura HMAC cobre o timestamp:

```
GET /api/sync/permissions
X-Roval-Timestamp: 1783440000
X-Roval-Signature: sha256=HMAC_SHA256(ROVAL_SYNC_SECRET, "1783440000")
```

Valide como no webhook: timestamp na janela de ±5 min, comparação timing-safe.

**Resposta esperada:**

```json
{
  "version": 1,
  "permissions": [
    {
      "key": "CAN_VIEW_PANEL",
      "nome": "Visualizar painel e resultados",
      "descricao": "Acessa o painel administrativo",
      "categoria": "Painel",
      "ordem": 1
    }
  ],
  "defaults": ["CAN_VIEW_PANEL"]
}
```

| Campo | Descrição |
|---|---|
| `version` | Inteiro. Incrementar quando o catálogo mudar (diagnóstico). |
| `permissions[].key` | **Chave estável** — é o que volta no `permissions` do upsert. Nunca renomeie sem migração. |
| `permissions[].nome` / `descricao` | Texto exibido nos checkboxes do hub. |
| `permissions[].categoria` / `ordem` | Agrupamento e ordenação na tela do hub. |
| `defaults` | Chaves pré-marcadas quando um admin concede o sistema a um usuário novo. Use o mínimo útil (nunca "tudo"). |

Os nomes de campo também são aceitos em inglês (`name`, `description`,
`category`, `order`) — o hub normaliza.

O admin sincroniza o catálogo no hub clicando em **"Atualizar catálogo"** na
tela de permissões (ou automaticamente no primeiro uso). Chave que sumir do
catálogo num refresh é desativada no hub (some da UI) sem perder atribuições.

### 13.2 — Aplique o conjunto recebido no `user.upsert`

Quando o payload do webhook traz `permissionsManaged: true` + `permissions`:

1. **Replace total**: o conjunto recebido substitui as permissões locais do
   usuário (adicione as que faltam, remova as que sobram).
2. **Filtre pelas suas chaves válidas** — chave desconhecida é ignorada com
   log de warning (o catálogo do hub pode estar defasado), nunca erro 4xx/5xx.
3. **Nunca toque no admin local** (superusuário) — mesmo que o payload venha
   com permissões.
4. **Usuário novo**: crie já com o conjunto do payload. Se o payload NÃO tiver
   gestão central (hub antigo), use um default mínimo e seguro — nunca acesso
   total.
5. **UI local somente-leitura**: para usuários de origem Roval, a tela local de
   permissões deve mostrar aviso "Gerenciado pelo RovalConnecta" e bloquear
   edição (o backend também deve rejeitar, com mensagem apontando pro hub).

```js
// No seu handler de user.upsert:
if (user.permissionsManaged === true && Array.isArray(user.permissions)) {
  const valid = user.permissions.filter((k) => MINHAS_CHAVES.includes(k));
  await replacePermissoesDoUsuario(localUser.id, valid); // diff add/remove
}
// ausente/false → NÃO mexa nas permissões locais
```

### 13.3 — Checklist do catálogo

- [ ] `GET /api/sync/permissions` implementado, assinado e na janela anti-replay
- [ ] Chaves estáveis (renomear = migração coordenada com o hub)
- [ ] `defaults` com o mínimo útil
- [ ] `user.upsert` aplica `permissions` com semântica replace
- [ ] Chave desconhecida → warning, não erro
- [ ] Admin local imune ao replace
- [ ] Usuário novo sem gestão central → default mínimo (NUNCA todas)
- [ ] UI local de permissões somente-leitura pra usuários de origem Roval

**Implementações de referência:** nr1 (`server/routes/sync.js` +
`server/constants/permissions.js` — catálogo em código) e FAC
(`src/server/handlers/sync-permissions.ts` — catálogo em tabela do banco).

---

## Anexo A — Referências

| Recurso | Onde |
|---|---|
| Servidor de exemplo (mock) | `backend/scripts/example-external-sync-server.ts` |
| Implementação do dispatcher | `backend/src/modules/integration/integration.service.ts` |
| Auditoria de eventos | painel admin → **Auditoria** |
| Status de replicação por usuário | painel admin → **Usuários** → coluna Replicação |
| Endpoint de retry manual | `POST /integration/retry/{statusId}` (autenticado como admin) |
| Endpoint de backfill | `POST /integration/backfill/{moduleId}` (autenticado como admin) |

---

**Em caso de dúvidas:** consulte também o documento `INTEGRATION.md` (mais
sintético, contrato técnico) e o código do servidor de exemplo, que é uma
implementação completa e funcional em ~80 linhas.
