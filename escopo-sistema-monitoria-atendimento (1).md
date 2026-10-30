# Escopo — Sistema de Monitoria de Atendimento

**Versão:** 1.1 (rascunho) · **Data:** 30/09/2026 · **Autor:** Joyce

---

## 1. Visão geral

Sistema web de monitoria da qualidade, organizado em **dois módulos separados**, cada um com seu próprio card na tela inicial:

- **Módulo Vendedores** — monitoria da qualidade de atendimento dos ~30 vendedores, substituindo o processo atual do Microsoft Forms "Checklist de Atendimento – Vendedor". Transforma o checklist em avaliação com nota (0 a 100), controla a cobertura mensal (todo vendedor avaliado ao menos 1 vez por mês), mostra quem já foi e quem falta ser avaliado, destaca vendedores com desempenho baixo ou mediano para monitorias adicionais e plano de acompanhamento, com dashboard, histórico e observações.
- **Módulo Lojas** — monitoria e avaliação das 5 lojas, conduzida por **outro monitor**, com **checklist próprio** (critérios da loja em si, independentes das notas dos vendedores), mesma mecânica de nota 0–100 com pesos, cobertura mensal (toda loja avaliada ao menos 1 vez por mês), lista de foco para lojas com nota baixa e dashboard analítico próprio.

Os dois módulos são separados na navegação e nos dashboards, mas os **dois monitores têm acesso um ao módulo do outro** (visualização cruzada) — a separação é de organização, não de sigilo.

O sistema será um web app próprio, nos moldes do Chamados TI, com possibilidade de integração ao hub RovalConnecta para login (SSO) e permissões.

### Problemas do processo atual (Forms)

O Forms atual coleta as respostas, mas não gera nota, não controla quem já foi avaliado no mês, não separa a visão por loja, não guarda observações estruturadas por monitoria, não destaca vendedores com atendimento ruim e obriga a análise manual das respostas em planilha. A lista de vendedores e lojas fica "engessada" dentro do formulário, e qualquer mudança de quadro exige editar o Forms manualmente.

---

## 2. Usuários e permissões

| Perfil | O que faz |
|---|---|
| **Monitor(a) de Vendedores** | Registra monitorias de vendedores, edita/complementa observações e acompanha a cobertura do módulo Vendedores. Também acessa as visões de gestão e o módulo Lojas (visualização). |
| **Monitor(a) de Lojas** | Registra monitorias de lojas (checklist próprio), observações e acompanha a cobertura do módulo Lojas. Também acessa as visões de gestão e o módulo Vendedores (visualização). |
| **Gestão** | Acesso somente de visualização e acompanhamento nos dois módulos: dashboards, notas, cobertura, históricos, observações e planos de ação. Não registra monitoria. |
| **Administrador** | Mantém cadastros (vendedores, lojas, os dois checklists, pesos, metas) e gerencia usuários. Pode ser um dos monitores ou TI. |

Cada monitor **registra** apenas no seu módulo, mas **enxerga** o módulo do outro — os cards ficam separados na home ("Monitoria de Vendedores" e "Monitoria de Lojas") e cada um abre seu próprio conjunto de telas, cobertura e dashboard.

Vendedores **não têm acesso** ao sistema. O feedback ao vendedor continua sendo feito pessoalmente pelos monitores/gestão, com apoio dos relatórios.

Autenticação: login via RovalConnecta (SSO) com papéis/permissões vindos do catálogo do hub; fallback de login local se necessário.

---

## 3. Modelo de avaliação e nota

O motor de nota é **o mesmo para os dois módulos** (critérios com peso somando 100, "Não se aplica" com redistribuição, faixas de classificação); o que muda é o checklist de cada um.

### 3.1 Checklist de Vendedores (herdado do Forms atual)

Cada pergunta do checklist vira um **critério com peso**. Sugestão inicial de pesos (ajustáveis no cadastro, sempre somando 100):

| # | Critério | Resposta | Peso sugerido |
|---|---|---|---|
| 1 | Saudação inicial (Bom dia/Boa tarde/Boa noite) | Sim / Não | 10 |
| 2 | Apresentação cordial | Sim / Não | 10 |
| 3 | Identificação do cliente (cadastro/nome) | Sim / Não | 10 |
| 4 | Condução do atendimento (perguntas abertas e objetivas) | Sim / Não | 20 |
| 5 | Interação ativa durante o atendimento | Sim / Não | 15 |
| 6 | Postura e comunicação | Sim / Não | 15 |
| 7 | Upselling (oferta complementar) | Sim / Não / Não se aplica | 20 |

Os campos **Loja**, **Vendedor(a)** e **Canal do atendimento** (Balcão / WhatsApp) deixam de ser "perguntas" e viram campos estruturados da monitoria, alimentados pelos cadastros.

### 3.2 Checklist de Lojas (a definir com o monitor de lojas)

Checklist **próprio e independente** das notas dos vendedores, com a mesma mecânica de pesos. Os critérios serão definidos com o monitor responsável; proposta inicial para discussão:

| # | Critério (exemplo) | Resposta | Peso sugerido |
|---|---|---|---|
| 1 | Organização e limpeza do ambiente | Sim / Não | 20 |
| 2 | Vitrine e exposição de produtos no padrão | Sim / Não | 20 |
| 3 | Comunicação visual / campanhas vigentes aplicadas | Sim / Não / Não se aplica | 15 |
| 4 | Estrutura e equipamentos em ordem | Sim / Não | 15 |
| 5 | Processos operacionais seguidos (abertura, caixa, cadastro) | Sim / Não | 15 |
| 6 | Clima e postura geral da equipe | Sim / Não | 15 |

A monitoria de loja registra: loja, data da visita, respostas, nota 0–100, observações e (fase 2) fotos como evidência.

### 3.3 Cálculo da nota (comum aos dois módulos)

- Cada "Sim" soma o peso do critério; "Não" soma 0.
- **Não se aplica**: o critério sai do cálculo e os pesos restantes são redistribuídos proporcionalmente (a nota continua na escala 0–100). Ex.: se o Upselling (20) não se aplica, os 80 pontos restantes passam a valer 100%.
- Nota final da monitoria: 0 a 100.
- Nota do vendedor (ou da loja) no mês: média das monitorias do mês. Nota acumulada: média ponderada do período escolhido.

### 3.4 Faixas de classificação (sugestão, configuráveis — valem para os dois módulos)

| Faixa | Nota | Cor | Ação |
|---|---|---|---|
| Excelente | 90–100 | Verde | Reconhecimento |
| Bom | 75–89 | Verde-claro | Acompanhamento normal |
| Regular (atenção) | 60–74 | Amarelo | Entra na lista de foco — nova monitoria no mesmo mês |
| Crítico | 0–59 | Vermelho | Foco prioritário — plano de ação + monitorias extras |

### 3.5 Evoluções possíveis do modelo

- Trocar Sim/Não por escala 0–5 em critérios comportamentais (postura, condução) para mais granularidade — o motor de cálculo já deve nascer preparado para isso.
- Perguntas condicionais por canal (ex.: critérios específicos de WhatsApp, como tempo de resposta).
- Versionamento do questionário: alterar perguntas/pesos cria uma nova versão, preservando o cálculo das monitorias antigas.

---

## 4. Funcionalidades

A tela inicial apresenta **dois cards separados** — **Monitoria de Vendedores** e **Monitoria de Lojas** — cada um abrindo seu módulo completo (registro, cobertura, foco e dashboard próprios). Os itens 4.1 a 4.4 descrevem o módulo Vendedores; o 4.5, o módulo Lojas; o 4.6, cadastros e administração comuns.

### 4.1 Registro de monitoria (Vendedores)

Formulário equivalente ao checklist atual, preenchido pela avaliadora: loja e vendedor (selecionados dos cadastros, com busca), canal (Balcão/WhatsApp), data/hora do atendimento avaliado, respostas dos critérios e **campo de observações** (texto livre: pontos fortes, pontos a melhorar, contexto do atendimento). A nota é calculada e exibida na hora, antes de salvar. Possibilidade de anexar evidência (ex.: print de conversa de WhatsApp) — fase 2.

Observações também podem ser adicionadas **depois** (ex.: registro do feedback dado ao vendedor), mantendo histórico de quem escreveu e quando.

### 4.2 Cobertura mensal de vendedores (o "quem falta")

Painel central do mês corrente:

- **Por vendedor:** lista dos ~30 vendedores com status do mês — Avaliado (com nota e data) / Pendente — filtrável por loja e status.
- **Por loja:** as 5 lojas (Pedro II, Mag Shopping, Epitácio, Pátio Altiplano, B2C) com contadores tipo "7/8 avaliados", barra de progresso e destaque para lojas 100% concluídas vs. com pendências.
- **Resumo do mês:** X de Y vendedores avaliados, % de cobertura, dias restantes no mês.
- Alerta de fim de mês: vendedores ainda pendentes ganham destaque a partir de uma data configurável (ex.: dia 20).
- Regra de meta: mínimo 1 monitoria/vendedor/mês (configurável; vendedores em foco têm meta maior — ver 4.3).

### 4.3 Foco em baixo desempenho

- **Lista de foco** gerada automaticamente: vendedores cuja última nota ou média do mês caiu nas faixas Regular ou Crítico.
- Para cada vendedor em foco: meta de monitorias adicional no mês (ex.: Crítico = 3, Regular = 2 — configurável), plano de ação com observações da gestão/avaliadora, e acompanhamento da evolução da nota nas monitorias seguintes.
- Saída da lista de foco quando atingir a faixa Bom por N monitorias seguidas (configurável).
- Visão de evolução individual: gráfico da nota ao longo dos meses + notas por critério (identifica se o problema é sempre o mesmo, ex.: nunca faz upselling).

### 4.4 Dashboard (Vendedores)

- **Indicadores do mês:** cobertura (%), nota média geral, nota média por loja, quantidade de monitorias realizadas, nº de vendedores em cada faixa.
- **Rankings:** melhores e piores notas do mês (vendedores e lojas).
- **Análise por critério:** % de "Sim" por pergunta — mostra o ponto fraco coletivo (ex.: só 40% fazem upselling → pauta de treinamento).
- **Comparativos:** evolução mês a mês, comparação entre lojas, comparação Balcão × WhatsApp.
- **Histórico e drill-down:** clicar em um vendedor/loja abre o detalhe com todas as monitorias, notas, respostas e observações.
- Filtros: período, loja, vendedor, canal, faixa de nota. Exportação para Excel/PDF.

### 4.5 Módulo Lojas (card separado)

Espelha a estrutura do módulo Vendedores, com dados e telas próprios:

- **Registro de monitoria de loja:** loja, data da visita, checklist próprio (item 3.2) com nota calculada na hora, observações; fotos como evidência na fase 2.
- **Cobertura mensal de lojas:** as 5 lojas com status do mês — Avaliada (nota e data) / Pendente —, "X de 5 lojas avaliadas", e o mesmo alerta de fim de mês.
- **Foco em lojas:** lojas em faixa Regular/Crítico entram em lista de foco com meta de visita extra e plano de ação; visão de evolução da nota da loja mês a mês e por critério (ex.: vitrine sempre fora do padrão).
- **Dashboard analítico de Lojas:** nota média do mês, ranking das 5 lojas, % de "Sim" por critério do checklist de loja, evolução mensal por loja, histórico com drill-down para cada monitoria e suas observações, filtros por período/loja/faixa e exportação Excel/PDF.
- **Visão cruzada (leitura):** dentro do detalhe de uma loja, atalho opcional para o consolidado dos vendedores daquela loja no módulo Vendedores — apenas navegação; as notas não se misturam.

### 4.6 Cadastros e administração (comum aos dois módulos)

- **Vendedores:** nome, loja, status (ativo/inativo — inativo sai da cobertura sem perder histórico), data de admissão; transferência de loja mantém histórico.
- **Lojas:** as 5 atuais, com possibilidade de incluir novas.
- **Checklists (um de Vendedores, um de Lojas):** perguntas, descrições, tipo de resposta, pesos e ordem — cada um com versionamento independente.
- **Parâmetros:** faixas de nota, metas de monitoria por faixa, dia do alerta de fim de mês.
- **Usuários e papéis** (via RovalConnecta quando integrado).

---

## 5. Regras de negócio principais

1. Todo vendedor **ativo** deve ter ≥ 1 monitoria concluída por mês-calendário; toda loja **ativa** também deve ter ≥ 1 monitoria de loja por mês.
1. Cada monitor registra apenas no seu módulo (Vendedores ou Lojas), mas ambos têm acesso de visualização ao módulo do outro; as notas dos dois módulos **não se misturam** em nenhum cálculo.
2. A nota é calculada no ato do registro e congelada com a versão vigente do questionário (mudança de pesos não altera notas passadas).
3. "Não se aplica" redistribui pesos; se todos os critérios forem N/A a monitoria é inválida.
4. Vendedor em faixa Regular/Crítico entra automaticamente na lista de foco com meta ampliada de monitorias; loja em faixa Regular/Crítico entra na lista de foco de lojas com meta de visita extra.
5. Monitoria registrada não pode ser excluída pela avaliadora — apenas retificada com trilha de auditoria (quem alterou, quando, o quê).
6. Vendedor inativado no meio do mês sai do cálculo de cobertura daquele mês.
7. Observações têm autor e data/hora e não podem ser apagadas (apenas complementadas).

---

## 6. Modelo de dados (visão inicial)

- **Loja** (id, nome, ativa)
- **Vendedor** (id, nome, loja_id, ativo, admissão)
- **Checklist** (id, **tipo: vendedor | loja**, nome)
- **ChecklistVersao** (id, checklist_id, vigência, ativo)
- **Pergunta** (id, versao_id, texto, descrição, tipo_resposta, peso, ordem, permite_na)
- **Monitoria** (id, **tipo: vendedor | loja**, vendedor_id (nulo se loja), loja_id, canal (só vendedor), data_atendimento/visita, avaliador_id, versao_checklist_id, nota_final, faixa, criada_em)
- **RespostaMonitoria** (id, monitoria_id, pergunta_id, resposta, pontos_obtidos)
- **Observacao** (id, monitoria_id, autor_id, texto, criada_em)
- **PlanoAcao / Foco** (id, **alvo: vendedor_id ou loja_id**, mes_ref, motivo, meta_monitorias, status, observações)
- **Usuario** (via RovalConnecta: id, nome, papel)

Stack sugerida (alinhada ao Chamados TI): backend **NestJS** + banco relacional (PostgreSQL), frontend web responsivo, autenticação via RovalConnecta.

---

## 7. Fases de implementação

### MVP (Fase 1)

Home com os dois cards; cadastros básicos (lojas, vendedores, os dois checklists com pesos); registro de monitoria com nota automática e observações **nos dois módulos**; painéis de cobertura mensal (vendedores e lojas); lista simples de baixo desempenho por faixa em cada módulo; login com perfis monitor de vendedores / monitor de lojas / gestão.

**Critério de sucesso do MVP:** aposentar o Forms — 100% das monitorias do mês registradas no sistema, e cada monitor sabendo em segundos quem (vendedor ou loja) falta avaliar.

### Fase 2

Dashboards completos dos dois módulos (rankings, análise por critério, comparativos mês a mês e Balcão × WhatsApp no de vendedores), listas de foco com metas ampliadas e planos de ação, alertas de fim de mês, exportação Excel/PDF, versionamento dos checklists, trilha de auditoria, fotos como evidência na monitoria de loja.

### Fase 3 (futuro)

Integração SSO plena ao RovalConnecta, anexos de evidência (prints), escala 0–5 em critérios comportamentais, perguntas condicionais por canal, notificações automáticas (e-mail/WhatsApp) de pendências e quedas de nota, importação do histórico do Forms/Excel para série histórica, metas de nota por loja.

---

## 8. Migração do processo atual

1. Exportar o histórico de respostas do Forms (Excel) e importar como monitorias "legadas" (sem nota ou com nota calculada retroativamente com os pesos definidos).
2. Rodar 1 mês em paralelo (Forms + sistema) para validação, se necessário.
3. Desativar o Forms e manter o link antigo redirecionando/avisando.

---

## 9. Pontos em aberto (decidir antes do desenvolvimento)

- Confirmar os pesos de cada critério com a gestão (a tabela do item 3.1 é proposta).
- Definir com o monitor de lojas os critérios e pesos do checklist de loja (a tabela do item 3.2 é apenas ponto de partida).
- Confirmar as faixas de nota e as metas de monitoria extra por faixa.
- Definir se a monitoria de WhatsApp terá critérios próprios já no MVP ou só na fase 3.
- Quem terá o papel de administrador dos cadastros (avaliadora ou TI).
- Volume atual: ~30 vendedores × 1+ monitoria/mês ≈ 360+ registros/ano — baixo volume, sem exigência de infraestrutura pesada.
