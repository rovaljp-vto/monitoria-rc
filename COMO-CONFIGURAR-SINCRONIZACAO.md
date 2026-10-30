# Como configurar a sincronização de um sistema no RovalConnecta

Este guia explica, em linguagem clara, como conectar um sistema externo
(chamados, comunicados, NR-1, financeiro etc.) ao RovalConnecta para que ele
receba automaticamente os usuários cadastrados aqui.

O documento tem **dois lados** que precisam andar juntos:

- **Lado A — Admin do RovalConnecta:** o que você clica no painel.
- **Lado B — Desenvolvedor do sistema externo:** o que ele precisa preparar.

Quem está só do lado do painel pode ler só a parte A. Quem está
implementando o "outro lado" da integração precisa também da parte B (e do
guia técnico completo em [backend/GUIA-INTEGRACAO-SISTEMAS.md](backend/GUIA-INTEGRACAO-SISTEMAS.md)).

---

## Antes de começar: o que é "sincronizar"?

O RovalConnecta é o **lugar único** onde os colaboradores são cadastrados.
Quando você cria, edita, bloqueia ou exclui um usuário aqui, o sistema pode
avisar **automaticamente** outros sistemas da empresa para que eles
atualizem o cadastro deles também — sem você precisar fazer isso manualmente
em cada lugar.

A "ponte" entre os dois sistemas é uma **URL** e um **segredo**:

- A **URL** é o endereço do outro sistema onde o aviso chega.
- O **segredo** é uma "senha de máquina" que prova ao outro lado que o
  aviso veio mesmo do RovalConnecta (e não de um invasor).

Os dois lados precisam ter o **mesmo segredo** configurado.

---

# PARTE A — Lado do admin (no painel do RovalConnecta)

## Etapa 1 — Receba a URL do desenvolvedor do outro sistema

Antes de configurar qualquer coisa no painel, **peça ao desenvolvedor do
sistema externo** dois itens:

1. **Uma URL** onde o sistema dele recebe os avisos. Costuma terminar com
   algo como `/api/sync/users`. Exemplos:
   - `http://192.168.1.10:8080/api/sync/users` (servidor na rede local)
   - `https://chamados.suaempresa.com.br/api/sync/users` (servidor com domínio)

2. **A confirmação de que o endpoint dele já está pronto e rodando.** Se
   ainda não estiver, ele precisa terminar a Parte B deste guia antes.

> 💡 Você pode até cadastrar o sistema sem essa URL — basta não preencher
> os campos de sincronização. A integração só liga depois que tudo
> estiver no lugar.

---

## Etapa 2 — Acesse a Gestão de Sistemas

1. Faça login no RovalConnecta como **administrador**.
2. No menu lateral, clique em **Gestão de Sistemas**.
3. Você verá a lista de sistemas já cadastrados.

## Etapa 3 — Crie um novo sistema (ou abra um existente)

- **Sistema novo:** clique no botão **Novo sistema** (canto superior direito).
- **Sistema já cadastrado:** clique no ícone de lápis ✏️ na linha
  correspondente.

Vai abrir um formulário em janela.

## Etapa 4 — Preencha os campos básicos

| Campo | O que colocar |
|---|---|
| **Nome** | Nome amigável que vai aparecer como card. Ex.: `Sistema de Chamados`. |
| **Descrição** | Frase curta explicando o sistema. Ex.: "Abertura e acompanhamento de chamados internos". |
| **Rota** | O endereço que o card vai abrir. Pode ser uma página interna (`/chamados`) ou um endereço externo (`http://192.168.1.10:8080`). **Atenção:** essa NÃO é a URL de sincronização — é só onde o card leva quando o usuário clica. |
| **Ícone** | Escolha um ícone que represente o sistema. |
| **Ativo** | Deixe ligado ✅. Se desligar, o card some pra todos os usuários. |
| **Protegido** | Deixe ligado ✅. **Obrigatório** para a sincronização funcionar. |

> 💡 "Protegido" significa que o sistema exige login. Sistemas públicos
> (sem login) não precisam — e por isso o painel só mostra os campos de
> sincronização quando "Protegido" está ligado.

## Etapa 5 — Preencha o bloco "Replicação automática de usuário"

Esse bloco só aparece quando **Protegido** está marcado. Ele tem dois
campos importantes:

### 5.1 — URL de sincronização

Cole aqui **a URL completa** que o desenvolvedor do sistema externo te
passou na Etapa 1.

- ✅ Certo: `http://192.168.1.10:8080/api/sync/users`
- ❌ Errado: `192.168.1.10:8080` (sem `http://`)
- ❌ Errado: `http://192.168.1.10:8080` (sem o caminho `/api/sync/users`)

### 5.2 — Segredo HMAC

Esse é o "código secreto" que garante a segurança. Você tem três formas
de preenchê-lo:

**Opção A — Gerar um novo (recomendado para sistemas novos):**

1. Clique no botão **Gerar**.
2. O campo será preenchido com um valor longo de 64 caracteres.
3. O segredo aparece **visível** automaticamente.
4. Clique no botão de **copiar** (ícone 📋) ao lado do campo.
5. **Envie esse segredo de forma segura** ao desenvolvedor do sistema externo
   (mensagem privada, gerenciador de senhas, etc — **não mande por e-mail
   comum**).

**Opção B — Colar um segredo que o desenvolvedor já enviou:**

Se o desenvolvedor já criou o segredo do lado dele, cole aqui o mesmo
valor que ele te mandou.

**Opção C — Manter o segredo atual (só ao editar):**

Se você está editando um sistema que já tem segredo configurado, o campo
fica vazio mostrando `•••••••••• (já configurado — deixe vazio para
manter)`. **Não mexa** se quiser manter o segredo atual.

> ⚠️ **Importante:** depois que você salvar, o segredo **não aparece mais**
> na tela por motivos de segurança. Se você não copiou na hora e perdeu,
> vai precisar **gerar um novo** e atualizar nos dois lados.

## Etapa 6 — Confira a faixa azul de confirmação

Quando você preencher os dois campos (URL + Segredo) corretamente,
aparece logo abaixo uma faixa azul:

> 🔄 Replicação ficará ativa. Eventos serão enviados ao sistema externo.

Se essa faixa **não aparecer**, falta algum campo.

## Etapa 7 — Salve

Clique em **Criar sistema** (ou **Salvar alterações** se está editando).

**O que acontece automaticamente nesse momento:**

- Se você acabou de **ativar** a replicação (sistema novo ou primeira vez
  preenchendo URL+segredo), o RovalConnecta dispara um **backfill**: envia
  para o sistema externo o cadastro de **todos os usuários que já têm esse
  sistema liberado** nas permissões individuais. O administrador raiz
  (`admin`) também é replicado automaticamente.
- O painel não trava — o envio acontece em segundo plano. Pode levar
  alguns segundos por usuário.

## Etapa 8 — Libere o sistema para os usuários

Depois de cadastrar o sistema, ele ainda **não aparece** automaticamente
para os colaboradores. Permissões agora são dadas **uma a uma**:

1. Menu lateral → **Usuários**.
2. Clique no usuário que precisa ter acesso.
3. Botão **Editar permissões**.
4. Marque o sistema novo na lista.
5. **Salvar permissões**.

Cada vez que você libera um sistema para um usuário, o RovalConnecta
manda automaticamente o cadastro dele para o sistema externo.

### Permissões DENTRO de cada sistema (jul/2026)

Se o sistema publica um **catálogo de permissões** (nr1 e FAC publicam;
sistemas futuros devem seguir o `GUIA-INTEGRACAO-SISTEMAS.md`, seção 13),
ao marcá-lo a tela expande a seção **"Permissões dentro de cada sistema"**:

1. Na primeira vez, clique em **Atualizar catálogo** para buscar a lista
   de permissões daquele sistema.
2. Marque/desmarque o que o usuário pode fazer lá dentro (agrupado por
   categoria; usuário novo já vem com as permissões padrão pré-marcadas).
3. **Salvar permissões** — o conjunto é enviado ao sistema junto com o
   cadastro. Não é mais preciso configurar permissão no sistema externo:
   lá a tela fica somente-leitura ("Gerenciado pelo RovalConnecta").

> 💡 O **administrador raiz** (`admin`) tem acesso a todos os sistemas
> automaticamente e não precisa (nem pode) ter essas permissões editadas.

## Etapa 9 — Acompanhe o status da sincronização

Para cada usuário, dá pra ver se a replicação está funcionando:

1. Menu lateral → **Usuários**.
2. Na linha do usuário, olhe a coluna **Replicação**. Vai mostrar uma
   etiqueta com a contagem:
   - 🟢 `Sincronizado` — o sistema externo confirmou recebimento.
   - 🟡 `Pendente` — o envio começou mas ainda não terminou.
   - 🔴 `Erro` — algo deu errado (URL fora do ar, segredo errado,
     timeout).
   - ⚪ `Desativado` — usuário foi excluído ou bloqueado.
3. Clique na etiqueta para abrir os **detalhes**: cada sistema aparece
   com a mensagem de erro (quando houver) e um botão **Reenviar** que
   tenta de novo.

## Etapa 10 — O que fazer ao revogar acesso

Quando você **desmarca** um sistema na tela de permissões do usuário e
clica em **Salvar permissões**:

1. Aparece um modal vermelho de **confirmação**, listando todos os
   sistemas que vão receber a ordem de exclusão.
2. O modal explica que o usuário será **excluído** nesses sistemas e que
   os dados associados a ele podem ser perdidos.
3. Você precisa clicar **Confirmar exclusão** para prosseguir, ou
   **Cancelar** para voltar.

Se o sistema não tem replicação ativa (URL/segredo não configurados), o
modal **não aparece** — a permissão só some do painel sem disparar nada
no sistema externo.

---

## Como sincronizar tudo de uma vez (backfill manual)

Se em algum momento o sistema externo ficou fora do ar e perdeu eventos,
ou se você acabou de cadastrar muitos usuários e quer forçar o reenvio:

1. **Gestão de Sistemas** → ✏️ edite o sistema desejado.
2. Role até o final do formulário.
3. Clique em **Sincronizar todos os usuários**.
4. O painel mostra quantos usuários foram agendados para envio.

> ⚠️ Esse botão só aparece em sistemas que **já estão com replicação
> ativa** (URL + segredo configurados e salvos). E tem um limite de 5
> usos por minuto para não sobrecarregar o sistema externo.

---

## Como desligar a sincronização

Se você quer parar de sincronizar um sistema (mantendo ele cadastrado):

1. **Gestão de Sistemas** → ✏️ edite o sistema.
2. No bloco de replicação, marque a caixa **"Remover segredo (desativar
   replicação)"** ou apague o campo da URL.
3. **Salvar alterações**.

A faixa azul some, indicando que a replicação foi desligada. Eventos
futuros deixam de ser enviados. Os cadastros que já chegaram no sistema
externo **permanecem lá** — desligar não apaga histórico.

---

## Problemas comuns no painel

| Sintoma | Causa provável | Como resolver |
|---|---|---|
| Botão **Salvar** não dispara replicação | Faltou marcar **Protegido**, faltou URL ou faltou segredo | Confira os 3 itens; a faixa azul precisa aparecer antes de salvar |
| Usuário não chega no sistema externo após criar | O usuário não tem o sistema marcado nas permissões individuais | Vá em **Usuários** → editar permissões → marque o sistema |
| Coluna Replicação mostra `Erro` | Sistema externo fora do ar, URL errada ou segredo diferente entre os lados | Clique no badge → veja a mensagem de erro → ajuste e clique em **Reenviar** |
| `Erro: HTTP 401` no status | Segredo do RovalConnecta não bate com o do sistema externo | **Gerar** um segredo novo no painel e enviar ao desenvolvedor para ele reconfigurar |
| `Erro: HTTP 400 timestamp` | Relógio do servidor externo está com horário muito diferente do RovalConnecta | Pedir ao TI para sincronizar o relógio do servidor externo (NTP) |

---

# PARTE B — Lado do desenvolvedor do sistema externo

Esta parte é para a pessoa que está **implementando** o endpoint no
sistema externo. O documento completo, com exemplos de código em
Node.js, Python e PHP, está em
[backend/GUIA-INTEGRACAO-SISTEMAS.md](backend/GUIA-INTEGRACAO-SISTEMAS.md).
Abaixo vai um resumo do que precisa estar pronto **antes** do admin
configurar a sincronização no painel.

## O que você precisa entregar

### B.1 — Um endpoint HTTP que aceita POST

- **Caminho sugerido:** `/api/sync/users` (pode ser outro, mas precisa
  ser comunicado ao admin).
- **Método:** `POST`.
- **Resposta esperada:** HTTP 2xx em caso de sucesso; qualquer outro
  status faz o RovalConnecta tentar de novo (3 tentativas, com espera
  crescente: 1s → 4s → 16s).

### B.2 — Validação de segurança (obrigatória)

Cada requisição chega com dois cabeçalhos HTTP:

- `X-Roval-Signature: sha256=<hash>` — assinatura do corpo da requisição.
- `X-Roval-Timestamp: <unix-timestamp>` — momento em que foi enviada.

**O endpoint precisa fazer 3 verificações antes de aceitar qualquer
dado:**

1. **Timestamp recente:** rejeite se `|agora - X-Roval-Timestamp| > 300`
   segundos. Isso evita ataques de "repetição" de mensagens antigas.
2. **Assinatura confere:** calcule `HMAC-SHA256(corpo da requisição, segredo)`
   e compare com o valor do header. Se diferente, rejeite com HTTP 401.
3. **Comparação resistente a timing:** use uma função tipo `crypto.timingSafeEqual`
   em vez de `==` para evitar vazamento por tempo de resposta.

Se qualquer uma das três falhar, responda **401** (assinatura inválida)
ou **400** (timestamp expirado) e **não processe o corpo**.

### B.3 — Tratamento dos 3 tipos de evento

O corpo da requisição vem assim:

```json
{
  "event": "user.upsert",
  "user": {
    "id": "uuid-do-usuario-no-roval",
    "nome": "João da Silva",
    "username": "0123-JOAO",
    "codigoFuncionario": "0123",
    "telefone": "(83) 99999-9999",
    "filial": "Matriz",
    "setor": "TI",
    "ativo": true,
    "bloqueado": false,
    "superAdmin": false
  },
  "timestamp": 1700000000
}
```

Os possíveis valores de `event`:

| Evento | O que significa | O que seu sistema faz |
|---|---|---|
| `user.upsert` | Usuário foi criado, atualizado, ou um sistema foi liberado para ele | Cria o usuário local se ainda não existir; atualiza os dados se já existir. Use `codigoFuncionario` como chave para evitar duplicatas. |
| `user.disable` | Usuário foi bloqueado no RovalConnecta | Marque o usuário local como inativo. **Não apague** — pode ser temporário. |
| `user.delete` | Usuário foi excluído OU teve o acesso a esse sistema específico revogado | Remova ou desative permanentemente. Use a estratégia que faz sentido para o seu sistema (soft-delete recomendado). |

### B.4 — Configuração do segredo

Guarde o segredo HMAC em uma **variável de ambiente** ou **gerenciador de
segredos** (ex.: AWS Secrets Manager, Vault). **Nunca** no código-fonte
ou em arquivo versionado.

Nome sugerido: `ROVAL_SYNC_SECRET`.

### B.5 — Sobre senha e e-mail

- **Senha:** o RovalConnecta **não envia** a senha. Cada sistema gera
  sua senha local (pode ser temporária + força-troca-no-primeiro-login).
- **E-mail:** o RovalConnecta **não envia** e-mail. Se seu sistema
  precisar, derive a partir do `username` ou do `codigoFuncionario`.

### B.6 — Sobre o admin raiz (`superAdmin: true`)

Quando chegar um usuário com `superAdmin: true`, ele é o administrador
do RovalConnecta. Trate-o como administrador local também — mas em vez
de criar um novo, **vincule** ao admin que já existe no seu sistema
(geralmente atualizando os campos de identidade do admin pré-existente).
Veja o exemplo completo na seção 6.2 do
[guia técnico](backend/GUIA-INTEGRACAO-SISTEMAS.md).

---

## Checklist antes de pedir ao admin para ativar

- [ ] Endpoint POST `/api/sync/users` está no ar e respondendo.
- [ ] Variável `ROVAL_SYNC_SECRET` configurada no servidor.
- [ ] Validação de assinatura HMAC implementada e testada (req com
      segredo errado retorna 401).
- [ ] Validação de timestamp implementada (req com timestamp antigo
      retorna 400).
- [ ] Os 3 eventos (`user.upsert`, `user.disable`, `user.delete`) são
      tratados — mesmo que de forma simples.
- [ ] O admin raiz é **vinculado** ao admin local existente, não
      duplicado.
- [ ] Logs do seu sistema mostram cada evento recebido (ajuda muito no
      troubleshooting).

Quando todos os itens acima estiverem ✅, comunique ao admin do
RovalConnecta para que ele rode a **Parte A**.

---

## Material complementar

- **Guia técnico completo com exemplos de código:**
  [backend/GUIA-INTEGRACAO-SISTEMAS.md](backend/GUIA-INTEGRACAO-SISTEMAS.md)
- **Servidor de exemplo (Node.js) para testar:**
  [backend/scripts/example-external-sync-server.ts](backend/scripts/example-external-sync-server.ts)
- **Referência da API:** [backend/API.md](backend/API.md)
- **Documentação de integração detalhada (campos, retries, status):**
  [backend/INTEGRATION.md](backend/INTEGRATION.md)
