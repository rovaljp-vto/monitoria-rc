# Instalação no servidor — Monitoria de Qualidade

Roteiro para colocar o sistema no ar no **PC servidor de produção**, com o
PostgreSQL gerenciado pelo pgAdmin4. Siga na ordem: o sistema só sobe com o
segredo configurado, e o RovalConnecta só deve ser apontado para ele quando ele
já estiver respondendo.

| O quê | Valor |
|---|---|
| Porta | **3008** (frontend, API, webhook e SSO saem todos dela) |
| Banco | `monitoria_qualidade`, usuário `monitoria` |
| Webhook (syncUrl) | `http://<IP-DO-SERVIDOR>:3008/api/sync/users` |
| Catálogo | `http://<IP-DO-SERVIDOR>:3008/api/sync/permissions` |
| SSO | `http://<IP-DO-SERVIDOR>:3008/sso/login` (o hub deriva sozinho) |

> **Porta 3008, não 3005**: no servidor SVR-RCJP a 3005 já é do
> `roval-mensagens` (SmartFlow). Mapa em 30/09/2026: 3000 hub · 3001 nr1 ·
> 3002 fac · 3003 pop · 3004 escuta · 3005 mensagens · 3006 dash-financeiro ·
> 3007 chamados-ti · **3008 monitoria**.

---

## 1. Pré-requisitos no servidor

- **Node.js 22 LTS ou mais novo** — confira com `node --version`.
- **PostgreSQL** rodando, com acesso pelo pgAdmin4.
- **PM2** para manter o processo no ar: `npm install -g pm2`.
- A pasta do projeto copiada para o servidor, **sem** `node_modules`, `dist` e
  `.env` (ex.: `D:\MonitoriaQualidade`).

## 2. Banco de dados (pgAdmin4)

No pgAdmin4, conecte como `postgres`, abra o **Query Tool** no banco
`postgres` e rode, trocando a senha:

```sql
CREATE ROLE monitoria LOGIN PASSWORD 'TROQUE_POR_UMA_SENHA_FORTE';
CREATE DATABASE monitoria_qualidade OWNER monitoria ENCODING 'UTF8';
```

O usuário é dono só deste banco e não enxerga os bancos dos outros sistemas.
As tabelas **não** são criadas à mão: a etapa 5 faz isso com a migration.

## 3. Segredo HMAC

Gere o segredo no próprio servidor:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Guarde o valor (64 caracteres). Ele vai no `.env` (etapa 4) **e** no
RovalConnecta (etapa 8), idêntico nos dois lados. Não mande por e-mail.

## 4. Arquivo `.env`

Copie `backend\.env.example` para `backend\.env` e preencha:

| Variável | O que colocar |
|---|---|
| `DATABASE_URL` | `postgresql://monitoria:<senha-da-etapa-2>@localhost:5432/monitoria_qualidade?schema=public` |
| `PORT` | `3008` |
| `ROVAL_SYNC_SECRET` | o segredo da etapa 3 |
| `ROVAL_MODULE_ID` | deixe vazio por enquanto; preencha na etapa 8 |
| `ROVAL_CONNECTA_URL` | endereço do RovalConnecta (ex.: `http://192.168.1.4:3000`) |
| `NODE_ENV` | `production` |
| `SESSION_COOKIE_SECURE` | `false` se o servidor atende em HTTP puro na rede interna. Sem esta linha, produção assume `true`: o cookie vira Secure e a CSP ganha `upgrade-insecure-requests` — o navegador força HTTPS e a tela fica preta. |
| `PERMITIR_SESSAO_SEM_HTTPS` | `true`, junto com a linha acima (as **duas** são necessárias). É a trava que assume a escolha; sem ela, `SESSION_COOKIE_SECURE=false` em produção impede o sistema de subir, de propósito. |
| `DEMO_LOGIN` | `false` (em produção ela é ignorada de qualquer forma) |

> Se a senha do banco tiver `@`, `:`, `/` ou `#`, codifique na URL (`@` vira `%40`).

## 5. Instalar, criar as tabelas e compilar

Na raiz do projeto:

```powershell
npm run instalar        # dependências do backend e do frontend
npm run banco:migrar    # cria as tabelas, índices e travas no banco
npm run banco:seed      # admin local, 5 lojas, os 2 checklists v1 e os parâmetros
npm run build           # compila frontend e backend
```

O seed pode rodar de novo sem duplicar nada, e nunca sobrescreve checklist ou
parâmetro já ajustado pela tela.

> **Nunca** rode `seed:demo` em produção: ele cria vendedores e monitorias
> fictícios (e se recusa com `NODE_ENV=production`).

## 6. Subir com o PM2

```powershell
pm2 start ecosystem.config.cjs
pm2 save
pm2 logs monitoria-qualidade --lines 30
```

No log deve aparecer `Monitoria de Qualidade ouvindo em http://0.0.0.0:3008`.
Para iniciar junto com o Windows, use o mesmo mecanismo que os outros sistemas
do servidor já usam (ex.: `pm2-installer` ou tarefa agendada com `pm2 resurrect`).

## 7. Firewall

Libere a porta 3008 na rede interna:

```powershell
New-NetFirewallRule -DisplayName "Monitoria de Qualidade 3008" -Direction Inbound -Protocol TCP -LocalPort 3008 -Action Allow
```

Teste de outra máquina: `http://<IP-DO-SERVIDOR>:3008` deve abrir a tela
**"Entre pelo RovalConnecta"**.

## 8. Cadastrar no RovalConnecta

1. **Gestão de Sistemas → Novo sistema**
   - Nome: `Monitoria de Qualidade`
   - Rota: `http://<IP-DO-SERVIDOR>:3008`
   - Ativo ✅ · Protegido ✅
   - URL de sincronização: `http://<IP-DO-SERVIDOR>:3008/api/sync/users`
   - Segredo HMAC: **cole** o segredo da etapa 3 (não clique em Gerar)
   - Confira a faixa azul "Replicação ficará ativa" e salve.
2. Copie o **ID (UUID)** do sistema recém-criado para `ROVAL_MODULE_ID` no
   `.env` e reinicie: `pm2 restart monitoria-qualidade`. Com ele, o SSO recusa
   tokens emitidos para outros sistemas.
3. Ao salvar, o hub faz o backfill: o admin raiz chega e é **vinculado ao admin
   local** (não é criado um segundo admin).

## 9. Permissões

Em **Usuários → Permissões**, marque o sistema para cada pessoa e clique em
**Atualizar catálogo** na primeira vez. As 5 permissões:

| Chave | Nome no hub | Libera |
|---|---|---|
| `MON_VENDEDORES_VER` | Ver monitoria de vendedores | Cobertura, foco, monitorias, histórico e observações do módulo Vendedores (leitura) |
| `MON_VENDEDORES_REGISTRAR` | Registrar monitoria de vendedores | Registrar monitoria de vendedor e complementar observações |
| `MON_LOJAS_VER` | Ver monitoria de lojas | O mesmo, no módulo Lojas (leitura) |
| `MON_LOJAS_REGISTRAR` | Registrar monitoria de lojas | Registrar monitoria de loja e complementar observações |
| `MON_CADASTROS_GERENCIAR` | Administrar cadastros e parâmetros | Lojas, vendedores, os dois checklists, faixas, metas e alerta de fim de mês |

Perfis do escopo (§2):

| Perfil | Marcar |
|---|---|
| Monitor(a) de Vendedores | `MON_VENDEDORES_VER` + `MON_VENDEDORES_REGISTRAR` + `MON_LOJAS_VER` |
| Monitor(a) de Lojas | `MON_LOJAS_VER` + `MON_LOJAS_REGISTRAR` + `MON_VENDEDORES_VER` |
| Gestão | `MON_VENDEDORES_VER` + `MON_LOJAS_VER` |
| Administrador | `MON_CADASTROS_GERENCIAR` (+ as de leitura, se for acompanhar os módulos) |

Como os outros sistemas satélites, funciona assim:

- Quem tem o card liberado mas **nenhuma** permissão marcada não entra: o SSO
  explica o que falta. O catálogo não tem permissão padrão, de propósito.
- Revogar no hub vale no próximo clique da pessoa. O sistema relê as
  permissões do banco a cada requisição.
- O admin raiz do hub entra com acesso total e não tem permissões editáveis.

## 10. Primeiro uso

1. Entre pelo card com um usuário que tenha `MON_CADASTROS_GERENCIAR`.
2. **Administração → Vendedores**: cadastre os ~30 vendedores com a loja de cada um.
3. **Administração → Checklist de lojas**: ajuste os critérios e pesos com o
   monitor de lojas. O v1 é a proposta do escopo §3.2. Publicar cria a v2, e
   monitorias já feitas não mudam.
4. **Faixas e metas**: confirme com a gestão (padrão do escopo: 90/75/60; metas
   1, 2 e 3; alerta a partir do dia 20).

## 11. Verificação rápida (smoke test)

| Teste | Esperado |
|---|---|
| Abrir `http://<IP>:3008` sem sessão | Tela "Entre pelo RovalConnecta" |
| Clicar no card no hub com um usuário liberado | Entra direto na home, com os dois cards |
| Usuário com o sistema liberado, mas sem permissão | Página "Sem permissões neste sistema" |
| `GET /api/sync/permissions` sem assinatura | `400 timestamp expired` (a porta está fechada) |
| Hub → Usuários → coluna Replicação | 🟢 Sincronizado |

## Atualizar para uma versão nova

```powershell
pg_dump -U postgres -d monitoria_qualidade -F c -f D:\backups\monitoria-antes-de-atualizar.dump
npm run instalar
npm run banco:migrar
npm run build
pm2 restart monitoria-qualidade
```

A migration só acrescenta. Monitorias, respostas, observações e auditoria têm
trava no próprio banco (trigger) e não podem ser apagadas nem alteradas, nem
pelo pgAdmin.

## Problemas comuns

| Sintoma | Causa | Solução |
|---|---|---|
| Não sobe: `ROVAL_SYNC_SECRET não configurado` | `.env` sem o segredo | Etapa 4 |
| Não sobe: `SESSION_COOKIE_SECURE=false em produção` | HTTP sem assumir a escolha | `PERMITIR_SESSAO_SEM_HTTPS=true` (só na rede interna) |
| Não sobe: `Can't reach database server` | `DATABASE_URL` errada ou PostgreSQL parado | Conferir a etapa 2 e a URL |
| Hub mostra `Erro: HTTP 401` na replicação | Segredos diferentes nos dois lados | Colar o mesmo valor nos dois e reiniciar |
| Hub mostra `HTTP 400 timestamp` | Relógio do servidor fora de hora | Sincronizar o NTP do Windows |
| SSO: "Usuário não cadastrado neste sistema" | A replicação ainda não chegou | Hub → Usuários → Replicação → Reenviar |
| SSO: "Token de outro sistema" | `ROVAL_MODULE_ID` com o UUID errado | Copiar o ID certo em Gestão de Sistemas |
