/*
 * Tema decidido ANTES da primeira pintura — evita o flash de tema trocado.
 * Arquivo, e não script inline no index.html: a CSP (script-src 'self') bloquearia.
 * Guarda a ESCOLHA ("claro" | "escuro"); sem escolha, o padrão é o CLARO
 * (decisão de 01/10/2026 — o escuro continua a um clique, no alternador).
 */
(function () {
  var escolha = null;
  try {
    escolha = localStorage.getItem('monitoria:tema');
  } catch (e) {
    /* armazenamento bloqueado: segue o padrão */
  }
  if (escolha !== 'escuro') document.documentElement.setAttribute('data-tema', 'claro');
})();
