# Guia de padronização — Criação de usuários no RovalConnecta

Este documento define **como criar usuários** no RovalConnecta de forma padronizada e quais **regras automáticas** o sistema aplica em cada etapa — em especial as que envolvem **sincronização com sistemas externos** e o **tratamento especial do administrador raiz**.

Use este guia quando for:

- Cadastrar um novo colaborador no painel.
- Implementar ou revisar o fluxo de criação no backend/frontend.
- Treinar um novo admin ou gestor que vai operar a tela.
- Auditar por que um usuário "não chegou" em um sistema externo.

---

## Índice

1. [Conceitos fundamentais](#1-conceitos-fundamentais)
2. [Pré-requisitos antes de criar um usuário](#2-pré-requisitos-antes-de-criar-um-usuário)
3. [Campos obrigatórios e opcionais](#3-campos-obrigatórios-e-opcionais)
4. [Regras de geração automática (username e e-mail)](#4-regras-de-geração-automática-username-e-e-mail)
5. [Senha padrão e primeiro login](#5-senha-padrão-e-primeiro-login)
6. [Perfis (roles) e quem pode atribuir cada um](#6-perfis-roles-e-quem-pode-atribuir-cada-um)
7. [Permissões — sistemas e guias administrativas](#7-permissões--sistemas-e-guias-administrativas)
8. [Sincronização automática com sistemas externos](#8-sincronização-automática-com-sistemas-externos)
9. [Regra especial — o administrador raiz](#9-regra-especial--o-administrador-raiz)
10. [Validações e erros mais comuns](#10-validações-e-erros-mais-comuns)
11. [Auditoria de criação](#11-auditoria-de-criação)
12. [Checklist do admin antes de salvar](#12-checklist-do-admin-antes-de-salvar)
13. [Anti-patterns — o que NÃO fazer](#13-anti-patterns--o-que-não-fazer)
14. [Arquivos de referência no código](#14-arquivos-de-referência-no-código)

---

## 1. Conceitos fundamentais

O RovalConnecta é a **fonte única de verdade** para a identidade dos colaboradores. Tudo que envolve "quem é a pessoa" (nome, código, filial, setor, telefone, perfil, acesso a sistemas) nasce aqui e é **replicado automaticamente** para os sistemas externos que estiverem integrados.

Três princípios não-negociáveis:

1. **Username não é digitado** — é **derivado** do nome e do código do funcionário.
2. **Senha não é digitada** — todo usuário nasce com a senha padrão `123456` e é **obrigado** a trocar no primeiro login.
3. **Senha nunca sai do RovalConnecta** — sistemas externos gerenciam autenticação local. Eles recebem o cadastro, não a senha.

---

## 2. Pré-requisitos antes de criar um usuário

Antes de abrir a tela "Criar usuário", garanta:

- Você é **ADMIN** *ou* tem a guia administrativa `users.create` liberada.
- Os **sistemas** que esse usuário vai acessar já estão cadastrados em **Gestão de Sistemas**.
- Se você é gestor (não ADMIN), você só pode liberar **os sistemas que você mesmo possui**. Liberar um sistema fora do seu conjunto retorna `403 Forbidden`.
- Você tem em mãos: nome completo, código do funcionário, telefone, filial, setor.

---

## 3. Campos obrigatórios e opcionais

### Obrigatórios

| Campo | Formato | Observações |
|---|---|---|
| Nome completo | texto livre | Aceita acentos. Primeiro nome é usado para gerar o username. |
| Código do funcionário | dígitos | **Único** no sistema. Usado como chave estável nos sistemas externos. |
| Telefone | texto livre | Formato sugerido `(83) 99999-9999`. |
| Filial | enum fixo | `Matriz · Mag Shopping · Eptácio · B2C · Altiplano`. |
| Setor | enum fixo | `Administrativo · Comercial · Consultoria · Estoque · Expedição · Financeiro · Laboratório · Loja · RH · TI`. |
| Sistemas | lista | **Pelo menos um** sistema precisa ser selecionado. |

### Opcionais

| Campo | Observações |
|---|---|
| Data de nascimento | Usada para a tela de aniversariantes do mês. Pode ser preenchida depois. |
| Guias administrativas | Só aparece para ADMIN. Lista de painéis que esse usuário poderá ver no menu lateral. |

### Campos que o backend **ignora mesmo se enviados**

- `senha` — sempre substituída por `123456`.
- `email` — sempre derivado do username (`<username>@roval.com.br`).

---

## 4. Regras de geração automática (username e e-mail)

### Username

A regra está em [`buildUsername()`](backend/src/modules/users/users.service.ts) e é determinística:

```
username = <CÓDIGO>-<PRIMEIRO_NOME_EM_MAIÚSCULAS>
```

Exemplos:

| Nome | Código | Username gerado |
|---|---|---|
| João da Silva | 0123 | `0123-JOAO` |
| Maria Antônia Pereira | 0001 | `0001-MARIA` |
| Ana | 42 | `42-ANA` |

Regras aplicadas pelo gerador:

- Acentos são **removidos** (`João` → `JOAO`).
- Apenas **letras** ficam no nome (`Ana-Beatriz` vira só `ANA`, pois só o primeiro nome é considerado).
- Apenas **dígitos** ficam no código.
- Sempre **MAIÚSCULAS**.
- Se faltar nome ou código, o backend retorna `400 — "Não foi possível gerar o usuário (informe nome e código)."`

### E-mail

```
email = <username>@roval.com.br
```

Exemplo: `0123-JOAO@roval.com.br`. O e-mail é **único** — se houver colisão, o backend retorna `409 Conflict` e o admin precisa revisar nome/código.

---

## 5. Senha padrão e primeiro login

- **Senha inicial:** `123456` para **todos** os usuários criados via painel.
- A flag `mustChangePassword` é setada como `true` na criação.
- No primeiro login, o gate global [`<MustChangePasswordGate>`](src/components/MustChangePasswordGate.tsx) força o redirect para `/trocar-senha` antes de qualquer rota protegida.
- A nova senha precisa ter **no mínimo 6 caracteres** e **não pode ser igual a `123456`** (proíbe "trocar pela mesma senha").
- Bcrypt **12 rounds** (NIST 2025) — definido em [`users.service.ts`](backend/src/modules/users/users.service.ts).
- Reset administrativo: o ADMIN pode resetar via `POST /users/:id/reset-password`. A senha volta para `123456` + `mustChangePassword=true`. O admin raiz **não pode** ser resetado por esse fluxo.

### Como entregar a credencial ao colaborador

Ao concluir a criação, o painel abre um dialog com:

- Usuário (ex.: `0123-JOAO`)
- Senha (`123456`)
- Botão **Copiar usuário e senha**

Comunique ao colaborador em canal seguro (mensagem direta, ticket interno). **Não envie senha por e-mail aberto.**

---

## 6. Perfis (roles) e quem pode atribuir cada um

Existem **3 roles** no enum Prisma:

| Role | Quem pode criar | Significado |
|---|---|---|
| `ADMIN` | Ninguém. Existe **apenas o admin raiz** criado pelo seed. | Acesso universal, imutável, protegido. |
| `GESTOR` | Apenas ADMIN. | Categoria de liderança. **É só uma etiqueta visual** — não concede permissões automaticamente. |
| `COLABORADOR` | ADMIN ou usuários com `users.create`. | Categoria padrão (etiqueta visual). |

### Regras de autorização na criação

- **Gestor (não-ADMIN) criando usuário:**
  - Só pode criar `COLABORADOR`. Tentar criar `GESTOR` ou `ADMIN` → `403 Forbidden`.
  - **Não pode** conceder guias administrativas (`adminPanels`). O backend descarta o array silenciosamente.
  - **Não pode** liberar sistemas que ele próprio não possui.
  - O campo `ativo` é forçado para `true`.

- **ADMIN criando usuário:**
  - Pode escolher `GESTOR` ou `COLABORADOR` na UI. `ADMIN` **não aparece** como opção propositalmente.
  - Pode conceder qualquer `adminPanel` da lista oficial.
  - Pode liberar qualquer sistema cadastrado.

> ⚠️ A role é uma **etiqueta visual**, não uma fonte de permissão. Acesso a sistemas é controlado por `user.systems`. Acesso a guias do painel é controlado por `user.adminPanels`. Mudar a role **não muda** o que o usuário vê.

---

## 7. Permissões — sistemas e guias administrativas

### Sistemas (`user.systems`)

- Lista de IDs de `SystemModule` que o usuário pode ver/acessar como **card no hub**.
- A tela de criação mostra **apenas** sistemas cadastrados e filtra **fora** rotas `/admin/*` (essas são tratadas em "Guias do painel lateral").
- **Mínimo 1 sistema** é exigido pela validação do form.
- Cada sistema marcado vira um candidato à replicação automática (ver seção 8).

### Permissões granulares por sistema (`UserModulePermission`) — jul/2026

Além de liberar o **card**, a tela **Editar permissões** agora também controla
o que o usuário pode fazer **dentro** de cada sistema integrado (nr1, FAC e
futuros que publiquem catálogo — ver `backend/GUIA-INTEGRACAO-SISTEMAS.md`,
seção 13):

- Cada sistema marcado expande com os checkboxes do catálogo dele, agrupados
  por categoria ("Atualizar catálogo" busca a lista no próprio sistema).
- **Usuário novo** recebe automaticamente as permissões **default** do
  catálogo de cada sistema liberado (o primeiro `user.upsert` já sai com elas).
- Ao salvar, o conjunto vai no campo `permissions` do webhook e **substitui**
  o que o sistema externo tinha (lá a edição local fica bloqueada, com aviso
  "Gerenciado pelo RovalConnecta").
- Auditoria: cada mudança gera `user.permissions.update` com o diff por sistema.

### Guias administrativas (`user.adminPanels`)

Só aparece para ADMIN. Lista canônica em [`admin-panel.decorator.ts`](backend/src/common/decorators/admin-panel.decorator.ts):

| ID | Tela do menu lateral |
|---|---|
| `users.create` | Criar Usuário |
| `users.list` | Usuários |
| `systems` | Gestão de Sistemas |
| `announcements` | Gestão de Comunicados |
| `notices` | Avisos & Popups |
| `birthdays` | Aniversariantes |
| `events` | Eventos |
| `audit` | Auditoria |

> 💡 Conceder `users.create` a um GESTOR é o jeito padrão de delegar cadastro sem dar role ADMIN.

### Adicionar uma nova guia

Sincronizar em **4 lugares** (mesma regra do `PROJECT_STANDARDS.md` seção 14):

1. [`backend/src/common/decorators/admin-panel.decorator.ts`](backend/src/common/decorators/admin-panel.decorator.ts) — enum `AdminPanelId`.
2. [`backend/src/modules/users/users.service.ts`](backend/src/modules/users/users.service.ts) — `VALID_ADMIN_PANELS`.
3. [`src/components/admin/AdminSidebar.tsx`](src/components/admin/AdminSidebar.tsx) — item no grupo correto.
4. [`src/pages/admin/AdminCreateUser.tsx`](src/pages/admin/AdminCreateUser.tsx) — array `ADMIN_PANELS`.

Esquecer um dos 4 = guia "invisível" ou "sem efeito".

---

## 8. Sincronização automática com sistemas externos

Esta é a **regra crítica** do fluxo: ao criar (ou alterar) um usuário, o RovalConnecta replica o cadastro para os sistemas externos que estiverem integrados.

### Quando a sincronização dispara na criação

Logo após `prisma.user.create()`, o service chama:

```ts
this.integration.dispatchToAllowed('user.upsert', created.id);
```

A função [`dispatchToAllowed()`](backend/src/modules/integration/integration.service.ts) é **fire-and-forget** via `setImmediate` — o admin recebe a resposta imediatamente; o envio acontece em segundo plano.

### Quais sistemas recebem o evento

Um sistema só recebe o `user.upsert` se atender **TODOS** os critérios:

1. `SystemModule.ativo = true`
2. `SystemModule.protegido = true`
3. `SystemModule.syncUrl != null`
4. `SystemModule.syncSecret != null`
5. O ID do sistema está em **`user.systems`** do usuário criado.

Se faltar qualquer critério, esse sistema **não recebe** o evento. Sem erro, sem retry — simplesmente fora do alvo.

> 💡 Por isso é importante: se o admin esperava que o colaborador "chegasse no sistema X", ele precisa garantir (a) que X está com replicação ativa em **Gestão de Sistemas** e (b) que X foi marcado nas permissões do usuário. Ver tabela de troubleshooting em [`COMO-CONFIGURAR-SINCRONIZACAO.md`](COMO-CONFIGURAR-SINCRONIZACAO.md).

### Conteúdo enviado ao sistema externo

O payload é construído por [`loadPayload()`](backend/src/modules/integration/integration.service.ts):

```json
{
  "event": "user.upsert",
  "user": {
    "id": "uuid-do-usuario",
    "nome": "João da Silva",
    "username": "0123-JOAO",
    "codigoFuncionario": "0123",
    "telefone": "(83) 99999-9999",
    "filial": "Matriz",
    "setor": "TI",
    "ativo": true,
    "bloqueado": false,
    "superAdmin": false,
    "permissions": ["CAN_VIEW_PANEL"],
    "permissionsManaged": true
  },
  "timestamp": 1700000000
}
```

> `permissions`/`permissionsManaged` (jul/2026): permissões granulares do
> usuário NAQUELE sistema, resolvidas por módulo no dispatch (não aparecem
> para superAdmin). Ver `backend/GUIA-INTEGRACAO-SISTEMAS.md`, seção 13.

**Nunca enviados:**
- `senha` — fica só no RovalConnecta.
- `email` — sistema externo deriva do `username`/`codigoFuncionario` se precisar.
- `adminPanels` — é controle interno do RovalConnecta, não faz sentido fora.
- `role` — substituída pelo booleano `superAdmin` (regra Opção B, ver seção 9).

### Garantias de entrega

- **3 tentativas** com retry exponencial: 1s → 4s → 16s.
- **Timeout 10s** por tentativa via `AbortController`.
- **Assinatura HMAC-SHA256** no header `X-Roval-Signature` + timestamp em `X-Roval-Timestamp` para anti-replay.
- Resultado registrado em `UserSyncStatus`: `pending | synced | error | disabled`.
- Erro **não bloqueia** a criação. O usuário foi criado; a replicação pode ser **reenviada** depois pelo painel (badge na coluna "Replicação" da tela de Usuários).

### O que NÃO dispara replicação

- Alterações **somente de senha** (`user.password.change`, `user.password.reset`). Sistemas externos têm senha própria.
- Alterações de `adminPanels` (campo interno).
- Edição de `dataNascimento` — campo decorativo, não relevante para sistemas externos.

A lista exata de campos que disparam está em [`users.service.ts > SYNCED_FIELDS`](backend/src/modules/users/users.service.ts):
`nome · codigoFuncionario · telefone · filial · setor · ativo · role`.

### O que acontece ao revogar acesso

Quando o admin **desmarca** um sistema em "Editar permissões":

- Sistema removido recebe `user.delete` (`dispatchToModules('user.delete', userId, [sistemaRemovido])`).
- Sistema adicionado recebe `user.upsert` (`dispatchToModules('user.upsert', userId, [sistemaAdicionado])`).
- Sistemas que permaneceram **não são tocados**.

### O que acontece ao bloquear / excluir

| Ação no painel | Evento enviado | Para quais sistemas |
|---|---|---|
| Bloquear usuário | `user.disable` | Todos os sistemas em `user.systems` com replicação ativa |
| Desbloquear | `user.upsert` | Idem |
| Excluir (soft-delete) | `user.delete` | **Todos os sistemas elegíveis** (`dispatchToAllProtected`), inclusive sistemas que não estão mais em `user.systems`, porque o usuário pode existir lá historicamente |

---

## 9. Regra especial — o administrador raiz

O `username = "admin"` recebe tratamento **diferente** em todo o fluxo. Esta é uma das regras que mais geram confusão — leia com atenção.

### O que é o admin raiz

- É criado **pelo seed**, não pela tela de criação.
- Username fixo: `"admin"`.
- Role: `ADMIN`.
- `mustChangePassword = false` (única exceção — o seed define uma senha real e estável).
- É marcado internamente como **protegido** pela função [`isProtected()`](backend/src/modules/users/users.service.ts) (`username === 'admin'`).

### O que ele **não pode** sofrer

| Ação | Resposta do backend |
|---|---|
| Ter o role rebaixado | `403 — "O administrador raiz precisa manter o perfil ADMIN."` |
| Ser editado por não-ADMIN | `403 — "Apenas ADMIN pode alterar o administrador raiz."` |
| Ter permissões editadas | Aceito como **no-op** (o painel não quebra; auditado com `note: 'admin-root-noop'`). |
| Ter a senha resetada via `/users/:id/reset-password` | `403 — "A senha do administrador raiz não pode ser redefinida por este fluxo."` |
| Ser bloqueado | `403 — "O administrador raiz não pode ser bloqueado."` |
| Ser excluído | `403 — "O administrador raiz não pode ser excluído."` |

### Como a sincronização trata o admin raiz

Esta é a regra **central** do tratamento especial:

> O admin raiz é considerado como tendo acesso a **TODOS** os sistemas elegíveis, ignorando completamente o campo `user.systems`.

Implementação em [`resolveTargets()`](backend/src/modules/integration/integration.service.ts):

```ts
const isRoot = u.username === 'admin';
const base = isRoot
  ? eligibleIds                              // admin: todos os sistemas elegíveis
  : eligibleIds.filter((id) => u.systems.includes(id));  // demais: intersecta
```

Consequências práticas:

1. **Ao cadastrar um novo sistema** com replicação ativa, o **admin raiz é incluído automaticamente** no backfill — `OR: [{ username: 'admin' }, { systems: { has: moduleId } }]` em [`backfill()`](backend/src/modules/integration/integration.service.ts).
2. **Ao gerar token SSO**, o admin raiz pode abrir qualquer sistema integrado sem precisar estar em `user.systems`.
3. **Não tente editar a lista `systems` do admin raiz** pra "tirar acesso a um sistema". Não vai funcionar — a regra `isRoot` ignora `user.systems` no resolveTargets.

### Como o admin raiz chega no sistema externo

O payload enviado leva `superAdmin: true`:

```json
{
  "event": "user.upsert",
  "user": {
    "username": "admin",
    "nome": "Administrador",
    "superAdmin": true,
    ...
  }
}
```

O sistema externo **não deve criar um usuário novo** com esse evento — deve **vincular ao admin que já existe** no banco dele (geralmente atualizando os campos de identidade do admin pré-existente, mantendo o ID local). Detalhes na seção B.6 de [`COMO-CONFIGURAR-SINCRONIZACAO.md`](COMO-CONFIGURAR-SINCRONIZACAO.md) e na seção 6.2 do [guia técnico de integração](backend/GUIA-INTEGRACAO-SISTEMAS.md).

### Por que o admin raiz é universal

A justificativa, registrada no código:

- Ele é o **operador de manutenção** do sistema. Se um sistema externo "trava" e precisa de intervenção, o admin raiz precisa conseguir entrar **sem depender de configuração prévia**.
- Tirar permissões dele criaria um cenário em que o próprio admin perde acesso ao painel que deveria consertar — armadilha clássica.
- Por isso a regra: **acesso universal, imutável, protegido**. Não é privilégio — é redundância operacional.

---

## 10. Validações e erros mais comuns

| Situação | HTTP | Mensagem |
|---|---|---|
| Nome ou código vazio | 400 | `Não foi possível gerar o usuário (informe nome e código).` |
| Código já cadastrado | 409 | `Código de funcionário "0123" já está cadastrado.` |
| Username derivado já existe | 409 | `Usuário "0123-JOAO" já existe.` |
| E-mail derivado colide | 409 | `Não foi possível gerar um endereço único. Revise o código e o nome.` |
| Não-ADMIN tentando criar GESTOR | 403 | `Apenas ADMIN pode criar usuários com perfil elevado.` |
| Não-ADMIN passando `adminPanels` | 403 | `Apenas ADMIN pode conceder guias administrativas.` |
| Não-ADMIN liberando sistema que não tem | 403 | `Você só pode liberar sistemas que já possui.` |
| Body com campo não declarado | 400 | `property X should not exist` (ValidationPipe `forbidNonWhitelisted`) |
| Senha < 6 chars na troca | 400 | `A nova senha precisa ter pelo menos 6 caracteres.` |
| Trocar senha pela própria `123456` | 400 | `A nova senha não pode ser igual à senha padrão.` |

---

## 11. Auditoria de criação

Toda criação gera log em `AuditLog` via [`audit.service.ts`](backend/src/modules/audit/audit.service.ts):

```ts
{
  action: 'user.create',
  actor: <admin-que-criou>,
  target: <id-do-novo-usuario>,
  metadata: {
    username: '0123-JOAO',
    role: 'COLABORADOR',
    systems: ['sistema-a', 'sistema-b']
  }
}
```

A tela de auditoria traduz para PT-BR via [`audit-describe.ts`](src/lib/audit-describe.ts):

> *"Cadastrou novo colaborador 0123-JOAO"*

Eventos correlatos disparados na mesma operação:

- `integration.sync.success` (1 por sistema que confirmou)
- `integration.sync.failure` (1 por sistema que falhou após 3 tentativas)

**Retention 180 dias** via cron diário às 03:00 BRT.

---

## 12. Checklist do admin antes de salvar

Use esse checklist mental (ou imprima ao lado da tela) antes de clicar **Criar usuário**:

- [ ] Nome completo correto (acentos serão removidos no username, mas o nome real fica preservado no perfil).
- [ ] Código do funcionário **único** — confirmado no RH/sistema-mãe.
- [ ] Telefone com DDD.
- [ ] Filial e setor selecionados.
- [ ] Pelo menos **1 sistema** selecionado.
- [ ] Se for delegar acesso administrativo: guias certas marcadas (só ADMIN vê esse bloco).
- [ ] Você está ciente que a senha será `123456` e que o colaborador **vai trocar** no primeiro login.
- [ ] O colaborador será comunicado por canal seguro (não e-mail aberto).
- [ ] Se a empresa usa sistemas externos integrados, você sabe que eles vão receber o cadastro nos próximos segundos.

---

## 13. Anti-patterns — o que NÃO fazer

- ❌ **Não digitar username manualmente.** Ele é derivado. Tentar contornar a regra cria divergência entre RovalConnecta e sistemas externos (que usam `codigoFuncionario` como chave).
- ❌ **Não criar "admin2" ou "admin_backup"** como tentativa de ter outro super-admin. A regra `isProtected` é amarrada ao `username === 'admin'` — qualquer outro nome é só um usuário comum com role ADMIN.
- ❌ **Não atribuir role ADMIN** via DB direto. A UI **não permite** porque é regra: existe **um e só um** admin raiz.
- ❌ **Não enviar senha customizada** pela API. Mesmo que o DTO aceite (retrocompat), o backend ignora.
- ❌ **Não tentar "tirar acesso" do admin raiz** editando `user.systems` dele. A função `resolveTargets` ignora esse campo para o admin — você só vai poluir o registro sem efeito real.
- ❌ **Não criar usuário sem nenhum sistema** "pra liberar depois". A validação do front exige ≥1; e o usuário sem sistemas nem vê o hub direito.
- ❌ **Não comunicar a senha em e-mail aberto / WhatsApp em grupo.** Use canal direto e instrua o usuário que ele vai trocar imediatamente.
- ❌ **Não esperar feedback síncrono da replicação.** A criação retorna imediatamente; o envio é fire-and-forget. Acompanhe pelo badge **Replicação** na tela de Usuários.
- ❌ **Não cadastrar o mesmo colaborador duas vezes "porque o primeiro deu erro".** Verifique o erro real — provavelmente o primeiro criou e a tentativa duplicada está colidindo em `codigoFuncionario`.

---

## 14. Arquivos de referência no código

**Backend**
- [backend/src/modules/users/users.service.ts](backend/src/modules/users/users.service.ts) — `create()`, `buildUsername()`, `DEFAULT_PASSWORD`, `VALID_ADMIN_PANELS`, `isProtected()`.
- [backend/src/modules/users/users.controller.ts](backend/src/modules/users/users.controller.ts) — endpoints `POST /users`, `GET /users`, etc.
- [backend/src/modules/users/dto/create-user.dto.ts](backend/src/modules/users/dto/create-user.dto.ts) — DTO com class-validator.
- [backend/src/modules/integration/integration.service.ts](backend/src/modules/integration/integration.service.ts) — `dispatchToAllowed()`, `resolveTargets()`, `loadPayload()`, `backfill()`. **Onde mora a regra do admin raiz.**
- [backend/src/common/decorators/admin-panel.decorator.ts](backend/src/common/decorators/admin-panel.decorator.ts) — enum `AdminPanelId`.
- [backend/prisma/schema.prisma](backend/prisma/schema.prisma) — model `User`, `SystemModule`, `UserSyncStatus`.

**Frontend**
- [src/pages/admin/AdminCreateUser.tsx](src/pages/admin/AdminCreateUser.tsx) — tela de criação.
- [src/pages/admin/AdminUsers.tsx](src/pages/admin/AdminUsers.tsx) — listagem + edição de permissões + badge de replicação.
- [src/components/MustChangePasswordGate.tsx](src/components/MustChangePasswordGate.tsx) — força troca no primeiro login.

**Documentação correlata**
- [PROJECT_STANDARDS.md](PROJECT_STANDARDS.md) — padrões gerais do projeto (seções 13 e 14 cobrem autenticação e autorização).
- [COMO-CONFIGURAR-SINCRONIZACAO.md](COMO-CONFIGURAR-SINCRONIZACAO.md) — guia para conectar um sistema externo (lado A admin / lado B desenvolvedor).
- [backend/GUIA-INTEGRACAO-SISTEMAS.md](backend/GUIA-INTEGRACAO-SISTEMAS.md) — guia técnico completo da integração (exemplos em Node.js, Python, PHP).

---

_Última revisão: maio/2026. Mantenedor: time RovalConnecta. Atualize sempre que mudar a regra do admin raiz, a senha padrão, a lista de roles ou a lista de adminPanels._