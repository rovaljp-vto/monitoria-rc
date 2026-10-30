/**
 * Mensagens padrão da apresentação de feedback, por critério (pelo texto).
 * Usadas pelo seed e pela migration que as introduziu. Depois disso, quem
 * ajusta é a Administração → Checklist (cada versão guarda as suas).
 */
export const MENSAGENS_PADRAO: Record<string, { sim: string; nao: string }> = {
  // ── Vendedores ──
  'Saudação inicial': {
    sim: 'Você recebeu o cliente com um cumprimento — bom dia, boa tarde ou boa noite. A primeira impressão começou do jeito certo.',
    nao: 'O atendimento começou sem cumprimento. Um “bom dia” ou “boa tarde” logo na chegada deixa o cliente à vontade desde o início.',
  },
  'Apresentação cordial': {
    sim: 'Você foi cordial com o cliente, se apresentou com simpatia e falou com respeito durante o atendimento.',
    nao: 'Faltou se apresentar de forma cordial. Dizer o seu nome e mostrar disposição em ajudar aproxima o cliente.',
  },
  'Identificação do cliente': {
    sim: 'Você identificou o cliente pelo nome e cadastro — isso deixa o atendimento pessoal e facilita as próximas compras.',
    nao: 'O cliente não foi identificado. Perguntar o nome ou consultar o cadastro personaliza o atendimento.',
  },
  'Condução do atendimento': {
    sim: 'Você conduziu bem o atendimento, com perguntas abertas e objetivas para entender o que o cliente realmente precisava.',
    nao: 'A condução pode melhorar: perguntas abertas, como “para que você vai usar?”, ajudam a entender a real necessidade do cliente.',
  },
  'Interação ativa durante o atendimento': {
    sim: 'Você se manteve presente e interagiu com o cliente o tempo todo, mostrando interesse de verdade.',
    nao: 'Faltou interação durante o atendimento. Manter a conversa e acompanhar o cliente mostra que você está ali por ele.',
  },
  'Postura e comunicação': {
    sim: 'Sua postura e comunicação foram muito boas: clareza, educação e atenção ao cliente do começo ao fim.',
    nao: 'Postura e comunicação merecem atenção — o tom de voz, a clareza e a linguagem corporal fazem diferença na experiência do cliente.',
  },
  Upselling: {
    sim: 'Você ofereceu um produto complementar — ótimo para a experiência do cliente e para as vendas da loja.',
    nao: 'Não houve oferta complementar. Sugerir um item que combine com a compra agrega valor ao atendimento.',
  },
  // ── Lojas ──
  'Organização e limpeza do ambiente': {
    sim: 'A loja estava organizada e limpa — o cliente encontra um ambiente agradável logo na entrada.',
    nao: 'Organização e limpeza precisam de atenção. Um ambiente arrumado muda a percepção do cliente sobre a loja.',
  },
  'Vitrine e exposição de produtos no padrão': {
    sim: 'Vitrine e exposição estavam no padrão, valorizando os produtos.',
    nao: 'A vitrine e a exposição estavam fora do padrão. Rever a disposição dos produtos ajuda a atrair e vender mais.',
  },
  'Comunicação visual / campanhas vigentes aplicadas': {
    sim: 'A comunicação visual das campanhas vigentes estava aplicada corretamente.',
    nao: 'Faltou aplicar a comunicação visual das campanhas vigentes — o cliente precisa enxergar as ofertas.',
  },
  'Estrutura e equipamentos em ordem': {
    sim: 'Estrutura e equipamentos estavam em ordem e funcionando.',
    nao: 'Havia problemas de estrutura ou equipamentos. Vale registrar e acompanhar a solução.',
  },
  'Processos operacionais seguidos': {
    sim: 'Os processos operacionais — abertura, caixa e cadastro — estavam sendo seguidos corretamente.',
    nao: 'Algum processo operacional (abertura, caixa ou cadastro) não estava sendo seguido. Vale reforçar o passo a passo com a equipe.',
  },
  'Clima e postura geral da equipe': {
    sim: 'A equipe mostrou bom clima e postura adequada no atendimento.',
    nao: 'O clima e a postura da equipe merecem atenção — isso aparece para o cliente.',
  },
};
