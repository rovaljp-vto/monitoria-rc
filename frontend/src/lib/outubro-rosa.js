/**
 * OUTUBRO ROSA — faíscas rosas no clique.
 *
 * Porte do efeito do RovalConnecta (`src/lib/sparkle-burst.ts` +
 * `src/components/hub/SparkleClickLayer.tsx`) para os sistemas satélites.
 * O hub é a referência: mexeu aqui, mexa lá também.
 *
 * JavaScript puro de propósito — o mesmo arquivo roda nos satélites em React
 * (import no entry do Vite) e no painel em HTML puro (<script src>), sem
 * depender de versão de React, TypeScript ou bundler.
 *
 * COMO LIGAR
 *   - App com Vite/React:  `import "./lib/outubro-rosa.js";` no main.jsx/tsx
 *   - HTML puro:           `<script src="outubro-rosa.js" defer></script>`
 *
 * Instala-se sozinho ao carregar, uma única vez (guarda em window), e:
 *   - só funciona durante OUTUBRO (`?outubro` na URL pré-visualiza fora do mês);
 *   - respeita `prefers-reduced-motion` (não dispara nada);
 *   - ignora cliques em elemento interativo (botão, link, campo, aba…), para
 *     não atrapalhar o uso — marque algo com `data-no-sparkle` para excluir;
 *   - ignora clique que fecha uma seleção de texto.
 */
(function () {
  "use strict";

  if (typeof window === "undefined" || typeof document === "undefined") return;
  // Idempotente: HMR do Vite e import duplicado não registram dois listeners.
  if (window.__outubroRosaInstalado) return;
  window.__outubroRosaInstalado = true;

  /** True durante outubro, ou com `?outubro` na URL (pré-visualização). */
  function estaEmOutubro() {
    if (new Date().getMonth() === 9) return true; // getMonth é 0-indexed
    return window.location.search.toLowerCase().indexOf("outubro") !== -1;
  }

  // Estrela de 4 pontas. `currentColor` herda a cor definida por faísca.
  var SPARKLE_SVG =
    '<svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%" aria-hidden="true">' +
    '<path d="M12 0l2.6 7.4L22 10l-7.4 2.6L12 20l-2.6-7.4L2 10l7.4-2.6z"/></svg>';

  var ROSA = ["#f472b6", "#ec4899", "#f9a8d4", "#db2777", "#fbcfe8"];

  /** Estouro de faíscas a partir de um ponto da viewport. */
  function sparkleBurst(x, y, opts) {
    opts = opts || {};
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    var count = opts.count || 14;
    var colors = opts.colors || ROSA;

    var layer = document.createElement("div");
    layer.setAttribute("aria-hidden", "true");
    layer.style.cssText =
      "position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:9999;";
    document.body.appendChild(layer);

    var pendentes = [];
    for (var i = 0; i < count; i++) {
      var el = document.createElement("div");
      var size = 8 + Math.random() * 14;
      el.style.cssText =
        "position:fixed;left:" + x + "px;top:" + y + "px;" +
        "width:" + size + "px;height:" + size + "px;" +
        "color:" + colors[i % colors.length] + ";transform:translate(-50%,-50%);" +
        "will-change:transform,opacity;filter:drop-shadow(0 0 4px currentColor);";
      el.innerHTML = SPARKLE_SVG;
      layer.appendChild(el);

      var angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
      var dist = 60 + Math.random() * 90;
      var dx = Math.cos(angle) * dist;
      var dy = Math.sin(angle) * dist - 20; // leve puxão pra cima
      var rot = (Math.random() - 0.5) * 360;
      var dur = 650 + Math.random() * 500;

      // Navegador sem Web Animations API: a faísca simplesmente não anima.
      if (typeof el.animate !== "function") continue;
      var anim = el.animate(
        [
          { transform: "translate(-50%,-50%) translate(0,0) scale(0.2) rotate(0deg)", opacity: 1 },
          {
            transform:
              "translate(-50%,-50%) translate(" + dx * 0.6 + "px," + dy * 0.6 + "px) " +
              "scale(1) rotate(" + rot * 0.6 + "deg)",
            opacity: 1,
            offset: 0.6,
          },
          {
            transform:
              "translate(-50%,-50%) translate(" + dx + "px," + dy + "px) " +
              "scale(0.3) rotate(" + rot + "deg)",
            opacity: 0,
          },
        ],
        // fill:forwards segura o último quadro (opacidade 0). Sem isto a Web
        // Animations API volta ao estado inicial ao terminar e "pisca" um
        // último brilho no ponto do clique antes da remoção.
        { duration: dur, easing: "cubic-bezier(.17,.84,.44,1)", fill: "forwards" },
      );
      pendentes.push(anim.finished ? anim.finished.catch(function () {}) : Promise.resolve());
    }

    Promise.all(pendentes).then(function () {
      if (layer.parentNode) layer.remove();
    });
    // Rede de segurança caso alguma animação não resolva.
    window.setTimeout(function () {
      if (layer.parentNode) layer.remove();
    }, 2200);
  }

  // Elementos em que o clique NÃO estoura faísca: tudo que é interativo, para
  // o efeito não competir com a ação que a pessoa quis fazer.
  var EXCLUIR = [
    "button",
    "a",
    "input",
    "textarea",
    "select",
    "label",
    "summary",
    "[role=button]",
    "[role=link]",
    "[role=menuitem]",
    "[role=menuitemcheckbox]",
    "[role=tab]",
    "[role=switch]",
    "[role=checkbox]",
    "[role=radio]",
    "[contenteditable=true]",
    "[data-no-sparkle]",
  ].join(",");

  function instalar() {
    if (!estaEmOutubro()) return;

    document.addEventListener("click", function (e) {
      if (e.button !== 0) return; // só clique esquerdo
      var target = e.target;
      if (!target || typeof target.closest !== "function") return;
      if (target.closest(EXCLUIR)) return;

      // Clique que encerra uma seleção de texto não é um clique "limpo".
      var sel = window.getSelection ? window.getSelection() : null;
      if (sel && sel.type === "Range" && String(sel).length > 0) return;

      sparkleBurst(e.clientX, e.clientY);
    });
  }

  // Exposto para quem quiser disparar o efeito à mão (ex.: ao concluir algo).
  window.sparkleBurst = sparkleBurst;
  window.isOutubroRosaActive = estaEmOutubro;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", instalar);
  } else {
    instalar();
  }
})();
