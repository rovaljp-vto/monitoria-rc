# Guia de SSO (Single Sign-On) — Login automático no sistema externo

> Este guia é complementar a [`GUIA-INTEGRACAO-SISTEMAS.md`](GUIA-INTEGRACAO-SISTEMAS.md).
> Lá você implementa a **replicação de usuários** (cadastro). Aqui você
> implementa o **login automático** — clicar no card do RovalConnecta e
> entrar no seu sistema já autenticado, sem digitar usuário/senha de novo.

---

## Pré-requisito

A replicação já precisa estar funcionando. O SSO **reutiliza o mesmo segredo
HMAC** da replicação (`syncSecret`), então se a replicação está ok, o SSO já
tem metade do trabalho feito.

## Como funciona em uma frase

Quando o usuário clica no card do seu sistema no RovalConnecta, o
RovalConnecta gera um **token assinado** de curta duração (~90s) e abre
`<seu-host>/sso/login?token=<token>`. Seu sistema valida a assinatura,
encontra o usuário pelo `codigoFuncionario`, cria a sessão local e redireciona
para a home interna.

## Fluxo passo a passo

```
1. Usuário clica no card "NR1" no hub do RovalConnecta
                 ▼
2. Frontend chama POST /integration/sso/<moduleId>  (com JWT do RovalConnecta)
                 ▼
3. Backend RovalConnecta:
   - Valida que o usuário tem acesso a esse sistema (user.systems ou admin raiz)
   - Monta payload { userId, username, codigoFuncionario, nome, superAdmin, iat, exp, moduleId }
   - Codifica em base64url
   - Assina com HMAC-SHA256(payload-base64url, syncSecret)
   - Devolve { url, token, expiresAt }
                 ▼
4. Frontend abre window.open(url) → navegador vai para
   http://host-do-nr1/sso/login?token=<base64url-payload>.<assinatura>
                 ▼
5. NR1 recebe a requisição:
   - Separa <payload> e <assinatura> pelo "."
   - Recalcula HMAC-SHA256(<payload>, syncSecret) e compara em timing-safe
   - Decodifica o payload (base64url → JSON)
   - Verifica que now <= exp (token não expirou)
   - Procura usuário local pelo codigoFuncionario (ou admin local pré-existente se superAdmin)
   - Cria sessão (cookie HttpOnly, JWT, etc.) e redireciona para a home
```

## Formato do token

```
<base64url-do-JSON>.<hex-da-assinatura-HMAC-SHA256>
```

**Conteúdo do JSON (`SsoTokenPayload`):**

```json
{
  "userId": "uuid-do-roval",
  "username": "0123-JOAO",
  "codigoFuncionario": "0123",
  "nome": "João da Silva",
  "superAdmin": false,
  "iat": 1731000000,
  "exp": 1731000090,
  "moduleId": "uuid-do-modulo"
}
```

Campos importantes:

- `codigoFuncionario` — **chave de match** com o usuário local. Use isto.
- `superAdmin: true` — significa que é o admin raiz do RovalConnecta. Trate
  como administrador local (vincule ao admin pré-existente do seu sistema).
- `iat` — issued at (Unix timestamp em segundos).
- `exp` — expira em (Unix seconds). TTL = `exp - iat` = 90 segundos.

## Implementação no seu sistema

### Validações obrigatórias

Antes de criar a sessão, **as três validações em ordem**:

1. **Assinatura confere** — recalcule HMAC-SHA256 do payload-base64url
   com o `syncSecret` e compare em **timing-safe**. Falha → 401.
2. **Token não expirou** — `Math.floor(Date.now() / 1000) <= exp`.
   Falha → 401 com mensagem clara ("token expirado, volte e clique de novo").
3. **Usuário existe localmente** — busca pelo `codigoFuncionario`. Se não
   achou, **rejeite** com mensagem "usuário não cadastrado neste sistema,
   contate o admin". Não auto-provisione — se não está no banco do seu
   sistema, a replicação não rodou e silenciar isso esconde um problema.

### Exemplo completo em Node.js

```ts
import crypto from 'crypto';
import express from 'express';

const SECRET = process.env.ROVAL_SYNC_SECRET!;
const app = express();

app.get('/sso/login', async (req, res) => {
  const token = String(req.query.token ?? '');
  const [payloadB64, signature] = token.split('.');
  if (!payloadB64 || !signature) {
    return res.status(400).send('Token ausente ou malformado.');
  }

  // 1. Assinatura
  const expected = crypto.createHmac('sha256', SECRET).update(payloadB64).digest('hex');
  const ok =
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  if (!ok) return res.status(401).send('Assinatura inválida.');

  // 2. Payload + expiração
  let payload: { codigoFuncionario: string | null; superAdmin: boolean; nome: string; username: string; exp: number };
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return res.status(400).send('Token corrompido.');
  }
  if (Math.floor(Date.now() / 1000) > payload.exp) {
    return res.status(401).send('Token expirado. Volte ao RovalConnecta.');
  }

  // 3. Usuário local
  const local = payload.superAdmin
    ? await db.findAdminLocal()
    : await db.findByCodigoFuncionario(payload.codigoFuncionario);
  if (!local) {
    return res.status(404).send('Usuário não cadastrado. Contate o administrador.');
  }

  // 4. Sessão — exemplo com express-session
  req.session!.userId = local.id;
  req.session!.username = local.username;

  // 5. Redirect para a home
  res.redirect('/');
});
```

### Exemplo em Python (Flask)

```python
import hmac, hashlib, base64, json, time
from flask import Flask, request, session, redirect

SECRET = os.environ['ROVAL_SYNC_SECRET']
app = Flask(__name__)

@app.get('/sso/login')
def sso_login():
    token = request.args.get('token', '')
    try:
        payload_b64, signature = token.split('.', 1)
    except ValueError:
        return 'Token malformado.', 400

    # 1. Assinatura
    expected = hmac.new(SECRET.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        return 'Assinatura inválida.', 401

    # 2. Payload + expiração
    payload = json.loads(base64.urlsafe_b64decode(payload_b64 + '==='))
    if int(time.time()) > payload['exp']:
        return 'Token expirado.', 401

    # 3. Usuário local
    if payload['superAdmin']:
        user = db.find_admin_local()
    else:
        user = db.find_by_codigo(payload['codigoFuncionario'])
    if not user:
        return 'Usuário não cadastrado.', 404

    # 4. Sessão
    session['user_id'] = user.id
    return redirect('/')
```

## Configuração necessária

**No RovalConnecta:** nada novo — o SSO usa o mesmo `syncSecret` que você já
configurou para a replicação. O endpoint é ativado automaticamente quando o
módulo tem replicação ativa (`protegido + syncUrl + syncSecret`).

**No seu sistema:**

1. Variável de ambiente `ROVAL_SYNC_SECRET` com o **mesmo valor** que está no
   campo "Segredo HMAC" do RovalConnecta.
2. Endpoint `GET /sso/login?token=...` implementado (exemplos acima).
3. O endpoint precisa estar acessível **pelo navegador do usuário**, na mesma
   origem que está em `syncUrl`. O RovalConnecta deriva o host SSO a partir do
   `syncUrl`: `<origin-do-syncUrl>/sso/login`. Se o `syncUrl` é
   `http://192.168.1.4:3001/api/sync/users`, o SSO vai para
   `http://192.168.1.4:3001/sso/login`.

## Como testar

1. Suba o mock server: `cd backend && set SYNC_SECRET=teste123 && npx ts-node scripts/example-external-sync-server.ts`
2. No RovalConnecta, cadastre um sistema apontando para esse mock (`syncUrl =
   http://localhost:9999/api/sync/users`, segredo `teste123`).
3. Crie um usuário no RovalConnecta com esse sistema marcado nas permissões.
   Confira no log do mock que o `user.upsert` chegou.
4. Faça login no RovalConnecta como esse usuário, vá ao hub, clique no card.
5. Uma nova aba abre na URL `http://localhost:9999/sso/login?token=...`. Se
   tudo deu certo, vê a página verde "✓ Login automático bem-sucedido".

## Troubleshooting

| Erro | Causa | Solução |
|---|---|---|
| 401 "Assinatura inválida" | Segredos diferentes nos dois lados | Sincronize o segredo (Gerar no painel → copiar → colar no env do sistema → reiniciar) |
| 401 "Token expirado" | Cliente esperou > 90s entre clicar e processar | Apenas clicar de novo — o token é gerado na hora do clique |
| 404 "Usuário não cadastrado" | Replicação não rodou para esse usuário | Confira o status em **Usuários → Replicação** no painel; clique em "Reenviar" se for "Erro" |
| Página em branco / não abre | Sistema externo não tem `/sso/login` implementado | Implementar o endpoint conforme exemplo acima |
| Cardo abre na rota direta sem token | Sistema sem replicação ativa | SSO só funciona em módulos com `syncUrl` + `syncSecret`. Configure ambos. |

## Segurança

- O token é **single-use moral** (TTL 90s) — não é blacklist ainda. Para
  blacklist real, persistir `iat`+`userId` no Redis com TTL e rejeitar
  duplicatas. **Pendência** se você quiser garantia forte de "uso único".
- O segredo nunca trafega — só a assinatura.
- Sempre use **HTTPS em produção**. HTTP só em redes internas confiáveis.
- Compare a assinatura com `crypto.timingSafeEqual` (ou `hmac.compare_digest`
  em Python) para evitar timing attacks.
- A sessão criada após o SSO **não deve ser eterna**. Use sua política de
  expiração local normal.
