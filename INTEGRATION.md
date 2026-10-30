# Integração — Replicação automática de usuários

Este documento descreve como um sistema externo (cadastrado no RovalConnecta em
**Gestão de Sistemas**) deve implementar o endpoint de sincronização para
receber identidades replicadas automaticamente.

---

## Quando o RovalConnecta envia eventos

Para cada `SystemModule` cadastrado com:

- `protegido = true` (login necessário)
- `syncUrl` configurada (URL do endpoint do sistema externo)
- `syncSecret` configurado (segredo HMAC compartilhado)

…o RovalConnecta dispara um POST a `syncUrl` sempre que um usuário é:

- **Criado** → `event: "user.upsert"`
- **Editado** (nome, telefone, filial, setor, código) → `event: "user.upsert"`
- **Bloqueado** → `event: "user.disable"`
- **Desbloqueado** → `event: "user.upsert"`
- **Excluído** (soft-delete) → `event: "user.delete"`

A senha **nunca** é enviada — cada sistema externo gerencia sua própria senha
local.

> **Atualização jul/2026 — gestão central de permissões.** O RovalConnecta
> agora TAMBÉM envia as permissões granulares do usuário (campo opcional
> `permissions` + `permissionsManaged` no `user.upsert`), atribuídas na tela
> central **Admin → Usuários → Permissões**. O sistema externo publica seu
> catálogo em `GET /api/sync/permissions` e aplica o conjunto recebido com
> semântica replace. Contrato completo: `GUIA-INTEGRACAO-SISTEMAS.md`,
> seção 13. Payloads sem esses campos (hubs antigos) continuam válidos — as
> permissões locais são preservadas.

---

## Contrato HTTP

```http
POST <syncUrl>
Content-Type: application/json
X-Roval-Signature: sha256=<hmac-hex-do-body>
X-Roval-Timestamp: <unix-seconds>

{
  "event": "user.upsert",
  "user": {
    "id": "uuid-do-roval",
    "nome": "Maria Silva",
    "username": "0001-MARIA",
    "codigoFuncionario": "0001",
    "telefone": "(83) 99999-9999",
    "filial": "Matriz",
    "setor": "TI",
    "ativo": true,
    "bloqueado": false,
    "superAdmin": false,
    "permissions": ["CAN_VIEW_PANEL", "CAN_EXPORT_DATA"],
    "permissionsManaged": true
  },
  "timestamp": 1735680000
}
```

> `permissions`/`permissionsManaged` são **opcionais** (só em `user.upsert` de
> não-superAdmin). Ver `GUIA-INTEGRACAO-SISTEMAS.md`, seção 13.

### Resposta esperada

| Status | Quando devolver | Corpo                                    |
|--------|------------------|------------------------------------------|
| **200** | Usuário criado/atualizado/desativado/removido com sucesso | `{ "externalId": "<id-local>" }` (opcional, mas recomendado — fica salvo no RovalConnecta para diagnóstico) |
| **401** | Assinatura HMAC inválida | qualquer corpo |
| **400** | Timestamp muito antigo (>5min) ou payload malformado | `{ "error": "..." }` |
| **5xx** | Erro interno (será logado e tentado novamente até 3×) | `{ "error": "..." }` |

---

## Validação obrigatória no sistema externo

1. **HMAC**: calcular `HMAC-SHA256(syncSecret, body_string)` e comparar com o
   header `X-Roval-Signature` (formato `sha256=<hex>`). Se não bater, devolver
   401. Use comparação **timing-safe**.
2. **Timestamp**: rejeitar se `|now - timestamp| > 300` segundos (5 min) — anti-replay.
3. **Identificação**: localize o usuário local pelo `codigoFuncionario` (ou
   por outro identificador estável que faça sentido no seu sistema). Se não
   existe → criar com as permissões do payload (`permissions`), ou — se o
   payload não tiver gestão central — como **inativo / com o mínimo de
   permissões**, esperando aprovação local. Se existe → atualizar dados
   básicos e, quando `permissionsManaged: true`, aplicar `permissions`
   (replace).

## Campo `superAdmin`

O payload contém `user.superAdmin: boolean`. Quando `true`, significa que o
usuário tem perfil ADMIN no RovalConnecta e o sistema externo deve atribuir o
**papel de maior privilégio local** automaticamente (super-admin / root /
master / etc — depende do nome do papel no seu sistema).

### Estratégia recomendada — vincular ao admin local pré-existente

A maioria dos sistemas internos já tem **um** admin local criado durante o
desenvolvimento (ex.: usuário `admin`, `root`, `master`). Em vez de criar um
**novo** super-admin a cada `user.upsert` com `superAdmin: true`, recomenda-se
**vincular** o admin do Roval ao admin local pré-existente:

```pseudo
if (user.superAdmin) {
  // não cria novo — atualiza o admin local que já existe
  const localAdmin = db.users.findFirst({ where: { role: "admin" } });
  localAdmin.nome = user.nome;
  localAdmin.codigoFuncionarioRoval = user.codigoFuncionario;
  localAdmin.usernameRoval = user.username;
  localAdmin.linkedToRoval = true;
  return { externalId: localAdmin.id };  // retorna o ID do admin LOCAL
} else {
  // user comum — cria/atualiza normalmente, papel local definido pelo admin
  upsertNormalUser(user);
}
```

Vantagens dessa abordagem:
- **Apenas 1 super-admin por sistema** (o que já existia)
- Quando o admin do Roval acessa via SSO, entra **como** o admin local — herda
  todos os dados/configurações que ele já tinha
- Nenhum risco de "vários admins concorrentes" no sistema externo

### Comportamento simétrico (rebaixamento)

Como o flag pode mudar (admin do Roval pode ser rebaixado para colaborador),
o sistema externo deve **respeitar o valor recebido em cada `user.upsert`**:

- `superAdmin: true` → vincula/atualiza o admin local existente
- `superAdmin: false` → desvincula o admin local (mantém o admin local intacto
  no sistema externo, mas remove a marca `linkedToRoval`); o usuário rebaixado
  passa a ser tratado como colaborador comum, criando/atualizando uma entrada
  separada se necessário

Isso garante que se um admin do Roval for rebaixado, ele perde os poderes
admin em todos os sistemas externos automaticamente.

---

## Exemplo: Node.js + Express

```javascript
import express from "express";
import { createHmac, timingSafeEqual } from "crypto";

const app = express();
const SYNC_SECRET = process.env.SYNC_SECRET;

// Importante: receber o body como buffer pra calcular HMAC sobre os bytes EXATOS recebidos
app.post(
  "/api/sync/users",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const sigHeader = String(req.headers["x-roval-signature"] ?? "");
    const tsHeader = Number(req.headers["x-roval-timestamp"] ?? 0);

    // 1. Anti-replay
    if (Math.abs(Date.now() / 1000 - tsHeader) > 300) {
      return res.status(400).json({ error: "timestamp expired" });
    }

    // 2. HMAC
    const expected = createHmac("sha256", SYNC_SECRET)
      .update(req.body) // Buffer cru
      .digest("hex");
    const provided = sigHeader.startsWith("sha256=") ? sigHeader.slice(7) : sigHeader;
    if (
      provided.length !== expected.length ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
    ) {
      return res.status(401).json({ error: "invalid signature" });
    }

    // 3. Processa
    const { event, user } = JSON.parse(req.body.toString("utf8"));
    if (event === "user.upsert") {
      // create/update local user (sem ativar/sem dar permissões)
      const localId = upsertLocalUser(user);
      return res.json({ externalId: localId });
    }
    if (event === "user.disable") {
      disableLocalUser(user.codigoFuncionario);
      return res.json({});
    }
    if (event === "user.delete") {
      deleteLocalUser(user.codigoFuncionario);
      return res.json({});
    }
    res.status(400).json({ error: "unknown event" });
  }
);
```

## Exemplo: PHP

```php
<?php
$body = file_get_contents("php://input");
$sigHeader = $_SERVER["HTTP_X_ROVAL_SIGNATURE"] ?? "";
$ts = (int) ($_SERVER["HTTP_X_ROVAL_TIMESTAMP"] ?? 0);
$secret = getenv("SYNC_SECRET");

if (abs(time() - $ts) > 300) {
    http_response_code(400);
    echo json_encode(["error" => "timestamp expired"]); exit;
}

$expected = "sha256=" . hash_hmac("sha256", $body, $secret);
if (!hash_equals($expected, $sigHeader)) {
    http_response_code(401);
    echo json_encode(["error" => "invalid signature"]); exit;
}

$payload = json_decode($body, true);
// ... process $payload['event'], $payload['user']
echo json_encode(["externalId" => "local-123"]);
```

## Exemplo: Python (Flask)

```python
import hmac, hashlib, time
from flask import Flask, request, abort, jsonify

app = Flask(__name__)
SYNC_SECRET = os.environ["SYNC_SECRET"].encode()

@app.post("/api/sync/users")
def sync():
    body = request.get_data()
    sig = request.headers.get("X-Roval-Signature", "")
    ts = int(request.headers.get("X-Roval-Timestamp", "0"))

    if abs(time.time() - ts) > 300:
        return ("timestamp expired", 400)

    expected = "sha256=" + hmac.new(SYNC_SECRET, body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        return ("invalid signature", 401)

    payload = request.get_json()
    # ... process payload['event'], payload['user']
    return jsonify(externalId="local-123")
```

---

## Fluxo de retry

Se o endpoint do sistema externo falhar (timeout ou status ≥ 400 sem ser 401),
o RovalConnecta tenta **3 vezes** com backoff exponencial (1s → 4s → 16s).
Após 3 falhas, marca o registro como `error` em `UserSyncStatus`. O admin pode:

- Ver o status na tabela de usuários (chip vermelho "N falha(s)")
- Clicar pra abrir detalhes e clicar **Reenviar** no item específico
- Ou usar `POST /integration/backfill/:moduleId` (admin) pra reenviar todos os
  usuários ativos para um sistema (útil quando um sistema fica offline e volta)

---

## Servidor de exemplo

Há um servidor mock em `backend/scripts/example-external-sync-server.ts` que
implementa o contrato pra você testar localmente. Rode com:

```bash
SYNC_SECRET=teste123 ts-node backend/scripts/example-external-sync-server.ts
```

Ele sobe na porta 9999 e loga cada evento recebido. Configure um SystemModule
no RovalConnecta apontando pra `http://localhost:9999/api/sync/users` com
`syncSecret=teste123` e `protegido=true` pra testar.
