# Permissões do Roval Escuta

O que cada permissão realmente destrava, o que ela **não** destrava, e como conceder.
Escrito a partir do código, não da intenção: cada item aponta o endpoint e a tela
correspondentes.

Fonte do catálogo: [`server/constants/permissions.js`](server/constants/permissions.js).
Regras de governança e operação: [`PRODUCAO.md`](PRODUCAO.md).

---

## Como o modelo funciona

O Roval Escuta **não concede permissão por conta própria**. Quem decide é o
RovalConnecta; aqui só chega o resultado.

1. O Escuta publica seu catálogo de 8 permissões em `GET /api/sync/permissions`
   (assinado por HMAC). O hub importa e monta a tela de permissões.
2. Você marca as permissões da pessoa no RovalConnecta.
3. O hub dispara `POST /api/sync/users` com o conjunto marcado.
4. O Escuta **substitui** o conjunto local pelo recebido (semântica *replace* —
   desmarcar no hub revoga aqui).

Quatro consequências que valem entender:

- **Não existe bypass.** `role` e `username` não abrem nada. Ser admin do
  RovalConnecta não dá acesso a denúncia. A decisão é 100% pelas permissões.
- **Revogação vale na hora.** O `middleware/auth.js` relê as permissões do banco a
  cada requisição, então tirar um grant no hub tem efeito imediato — não espera o
  token de 8h expirar.
- **Sem nenhuma permissão, não há sessão.** O SSO recusa a entrada e mostra um
  aviso; nada é gravado no navegador.
- **Chave desconhecida é ignorada.** Se o hub mandar uma chave fora do catálogo,
  ela é descartada com log, não concedida.

---

## Denúncias

### `CAN_VIEW_REPORTS` — Ver denúncias e acompanhar

É a permissão de entrada: sem ela a pessoa não chega em nenhuma denúncia.

**Destrava**

- Lista de denúncias com filtros e o painel — `GET /reports`
- Detalhe completo: descrição, tipo, setor, envolvido, testemunhas, histórico de
  movimentações e a conversa com o denunciante — `GET /reports/:id`
- Dashboard com indicadores e prazos — `GET /stats`
- **Exportação em CSV** — `GET /reports/export.csv`
- Leitura dos prazos de SLA e das respostas prontas
- Menus "Dashboard" e "Denúncias", e o contador de denúncias novas

**Não destrava**

- Baixar anexos (precisa de `CAN_VIEW_ATTACHMENTS`)
- Revelar quem é o denunciante (precisa de `CAN_REVEAL_IDENTITY`)
- Mudar status ou escrever qualquer coisa

> **Repare no CSV.** Esta permissão leva a denúncia inteira para fora do sistema,
> num arquivo que sai do controle de auditoria. Trate `CAN_VIEW_REPORTS` como
> acesso pleno de leitura, não como "só dar uma olhada".

### `CAN_UPDATE_STATUS` — Atualizar status

**Destrava**

- Mover a denúncia entre Recebida → Em apuração → Concluída → Encerrada —
  `PATCH /reports/:id/status`
- Arquivar e desarquivar — `PATCH /reports/:id/archive` (nunca exclui: a spec
  proíbe deleção)

**O que o nome não conta:** concluir ou encerrar **exige escrever um desfecho**, e
esse texto **é lido pelo denunciante** na consulta por protocolo. Quem tem esta
permissão fala com o denunciante em nome da empresa, ainda que por um campo só.

### `CAN_VIEW_ATTACHMENTS` — Ver anexos

**Destrava** baixar os arquivos enviados — `GET /reports/:id/attachments/:attId`.

**Sem ela**, a tela ainda mostra **quantos** anexos existem e o aviso "Você não tem
permissão para ver anexos" — a existência é visível, o conteúdo não.

Os anexos são gravados em disco com nome opaco e limpos de metadados no envio; o
nome original nunca é armazenado.

### `CAN_ADD_NOTES` — Adicionar observações internas

**O nome desta permissão engana e ela é a que mais surpreende.** Não são só notas
internas: são três poderes distintos.

| O que faz | Endpoint | Quem lê |
|---|---|---|
| Observação interna | `POST /reports/:id/notes` | só o comitê |
| Mensagem na conversa | `POST /reports/:id/messages` | **o denunciante** |
| Resposta pública | `PATCH /reports/:id/response` | **o denunciante** |

Ou seja: quem tem `CAN_ADD_NOTES` **conversa com o denunciante em nome da empresa**.
Conceda com a mesma consideração que daria a quem responde um cliente — não como se
fosse um bloco de rascunho.

### `CAN_REVEAL_IDENTITY` — Revelar identidade

A permissão mais sensível do sistema. Decifra o nome e o código de quem **optou por
se identificar** (denúncia anônima não tem o que revelar).

**Destrava** `POST /reports/:id/identity/reveal`, que exige uma **justificativa de no
mínimo 10 caracteres** e registra no histórico e na auditoria **quem revelou, quando
e por quê** — nunca a identidade em si.

**Sem ela**, quem tem `CAN_VIEW_REPORTS` ainda vê *que* a pessoa se identificou, só
não vê quem é.

A identidade fica cifrada em AES-256-GCM numa tabela separada, exigência da
Lei 14.457. Reserve esta permissão para o menor número possível de pessoas.

---

## Elogios

### `CAN_VIEW_PRAISES` — Ver elogios

Acessa os elogios recebidos (`GET /praises`) e o menu "Elogios" com seu contador.
Elogio não é dado sensível como a denúncia: quando a pessoa se identifica, o nome
fica em texto normal.

### `CAN_MANAGE_PRAISES` — Gerenciar elogios

Marca elogios como lidos ou reconhecidos — `PATCH /praises/:id/status`.
Na prática, conceda junto com `CAN_VIEW_PRAISES`.

---

## Configuração

### `CAN_MANAGE_SECTORS` — Gerenciar setores

O nome ficou menor que o escopo: é a permissão de **configuração do sistema**.

**Destrava**

- Setores do formulário — criar, editar, desativar
- Prazos de SLA por status — `PUT /settings/sla`
- Respostas prontas do comitê — criar, editar, excluir
- Menu "Configurações"

**Não destrava nada de denúncia.** É a permissão adequada para quem administra o
sistema sem participar do comitê.

---

## Combinações que fazem sentido

`CAN_VIEW_REPORTS` é pré-requisito prático de tudo em Denúncias: sem ela a pessoa
não navega até a denúncia, então `CAN_UPDATE_STATUS`, `CAN_ADD_NOTES`,
`CAN_VIEW_ATTACHMENTS` e `CAN_REVEAL_IDENTITY` ficam inalcançáveis pela tela.
Conceda-as sempre acompanhadas.

Perfis que costumam cobrir os casos reais:

| Perfil | Permissões |
|---|---|
| **Comitê — apuração** | `CAN_VIEW_REPORTS`, `CAN_VIEW_ATTACHMENTS`, `CAN_UPDATE_STATUS`, `CAN_ADD_NOTES` |
| **Comitê — com identidade** | as acima **+** `CAN_REVEAL_IDENTITY` |
| **Leitura / auditoria** | `CAN_VIEW_REPORTS` |
| **Elogios (RH)** | `CAN_VIEW_PRAISES`, `CAN_MANAGE_PRAISES` |
| **Configuração (TI)** | `CAN_MANAGE_SECTORS` |

---

## Como conceder no RovalConnecta

1. **Gestão de Sistemas → Roval Escuta** — libera o usuário no módulo. Sem isso o
   card nem aparece para ele.
2. **Usuários → Permissões → Roval Escuta** — marca as permissões.

Duas ressalvas:

- **Não use o `admin` raiz.** As permissões dele não são editáveis no hub, então ele
  sempre sincroniza vazio e não acessa o painel.
- Se as permissões do Escuta não aparecerem na tela, o hub ainda não importou o
  catálogo. Force com **Atualizar catálogo**, ou rode
  `npx ts-node scripts/register-escuta.ts` no backend do hub.

---

## O que fica registrado

Toda ação relevante grava em duas trilhas: o **histórico da denúncia** (visível no
detalhe) e o **log de auditoria** (`AuditLog`).

| Ação | Registra |
|---|---|
| Mudança de status | quem, de → para, desfecho |
| Mensagem ao denunciante | quem, quando, o texto |
| Resposta pública | quem, quando, se há resposta |
| Observação interna | quem, quando, o texto |
| **Revelação de identidade** | quem, quando, **a justificativa** — nunca a identidade |
| Entrada por SSO | quem, e o vínculo com o usuário do RovalConnecta |
