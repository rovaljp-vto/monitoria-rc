# Checklist Comercial

> Renomeado em 05/10/2026 — nome anterior: "Monitoria de Qualidade". Os
> identificadores técnicos (pasta `D:\Monitoria`, banco `monitoria_qualidade`,
> processo PM2 `monitoria-qualidade`, permissões `MON_*`) foram mantidos.

Sistema satélite do **RovalConnecta** para a monitoria da qualidade de
atendimento. Substitui o Microsoft Forms "Checklist de Atendimento – Vendedor".
São dois módulos com cards separados na home:

- **Vendedores**: checklist de atendimento com nota de 0 a 100, cobertura
  mensal ("quem falta avaliar"), lista de foco e histórico por vendedor.
- **Lojas**: checklist próprio da loja, com a mesma mecânica, conduzido pelo
  monitor de lojas.

Escopo completo: [escopo-sistema-monitoria-atendimento (1).md](escopo-sistema-monitoria-atendimento%20(1).md).
Instalação no servidor: **[INSTALACAO.md](INSTALACAO.md)**.

## Entregue nesta versão (MVP, Fase 1 do escopo)

- Login só pelo card do RovalConnecta (SSO). Quem chega sem sessão vê a tela
  "Entre pelo RovalConnecta", no mesmo padrão do FAC.
- Replicação de usuários (`/api/sync/users`), catálogo de permissões
  (`/api/sync/permissions`) e SSO (`/sso/login`), conforme os guias de
  integração desta pasta.
- Home com os dois cards, que mostram a cobertura do mês ao vivo.
- Registro de monitoria com a nota calculada enquanto se responde, e
  "Não se aplica" redistribuindo os pesos.
- Cobertura mensal por vendedor, por loja e de lojas, com alerta de fim de mês.
- Lista de foco (Regular ou Crítico, com meta de monitorias extras).
- Histórico por vendedor ou loja: média por mês e % de "Sim" por critério.
- Observações com autor e data, que só se acrescentam, e observação por
  critério já no registro.
- Imagens nas observações (botão, arrastar ou Ctrl+V de um print): até 6 por
  observação, reduzidas no navegador, tipo conferido pelo conteúdo no servidor
  e gravadas no próprio banco — o backup do PostgreSQL leva junto.
- **Apresentação de feedback** em tela cheia, para a conversa com a vendedora
  (às vezes dias depois): critérios, a pergunta "que nota você se daria?" com a
  nota da monitoria oculta, revelação com comparação, evolução e combinados.
  O feedback fica registrado na monitoria.
- Administração: lojas, vendedores (inativação e transferência), os dois
  checklists versionados, faixas, metas e usuários (somente leitura).

- **Dashboard** por módulo (antecipado da Fase 2): indicadores com variação
  vs período anterior, evolução da nota, monitorias por faixa, critérios que
  mais falham, critério × mês, nota média por loja, destaques e quem precisa
  de atenção, autoavaliação × nota. Período: mês atual (padrão), 3, 6 ou 12
  meses; filtros de loja e canal. Toda visualização tem a tabela equivalente.
- Cobertura de vendedores em quadro por loja (uma coluna por loja).

**Ficam para a Fase 2**, conforme o escopo: planos de ação, exportação
Excel/PDF, retificação com trilha e fotos como evidência na monitoria de loja.

## Regras garantidas pelo código

| Regra do escopo | Onde |
|---|---|
| Nota calculada no registro e congelada com a versão do checklist | [motor.ts](backend/src/common/nota/motor.ts) (o mesmo arquivo roda na tela e no servidor) + trigger `congelar_nota` |
| N/A redistribui os pesos; todos N/A invalida | [motor.ts](backend/src/common/nota/motor.ts) + [testes](backend/src/common/nota/motor.test.ts) |
| Notas dos dois módulos nunca se misturam | [painel.service.ts](backend/src/modules/monitorias/painel.service.ts) filtra por `tipo` |
| Monitoria não se exclui; observação não se edita nem apaga | triggers na [migration](backend/prisma/migrations/20260930120000_inicial/migration.sql) |
| Inativado no mês sai da cobertura daquele mês | `alvos()` em [painel.service.ts](backend/src/modules/monitorias/painel.service.ts) |
| Mês-calendário no fuso de São Paulo | [mes.ts](backend/src/common/tempo/mes.ts) + testes |

## Estrutura

```
backend/    NestJS 11 + Prisma 6 + PostgreSQL. Serve também o frontend compilado.
frontend/   React 19 + Vite + Tailwind v4 + TanStack Query + motion.
```

A stack e os padrões de integração são os mesmos do **Chamados TI**. O visual
segue o **Roval Escuta** (home) e o **FAC** (tela sem sessão).

## Desenvolvimento

```powershell
npm run test         # testes do motor de nota, do HMAC/SSO e do mês por fuso
npm run typecheck
npm run build
```

Para rodar a aplicação é preciso um PostgreSQL com o banco criado (ver
INSTALACAO.md). Com `NODE_ENV=development` e `DEMO_LOGIN=true`, a tela de
acesso mostra uma **porta de demonstração** para entrar como os usuários de
exemplo de `npm --prefix backend run seed:demo`. Ela assina um token SSO local
e passa pelo fluxo real de validação. Em produção ela não existe.
