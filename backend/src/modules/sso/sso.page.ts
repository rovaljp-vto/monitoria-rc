/**
 * Página de erro do SSO.
 *
 * Quem cai aqui está num navegador, não num cliente HTTP: um JSON de erro seria
 * inútil. A página diz o que aconteceu e QUEM resolve.
 */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function paginaErroSso(titulo: string, detalhe: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<title>${escapar(titulo)} — Checklist Comercial</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f6f7f9; --card: #ffffff; --texto: #1a1d21; --suave: #5b6470;
    --borda: #e3e6ea; --alerta: #b42318; --alerta-bg: #fef3f2;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f1116; --card: #171a21; --texto: #e8eaed; --suave: #9aa3af;
      --borda: #262b34; --alerta: #f97066; --alerta-bg: #2a1614;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
    background: var(--bg); color: var(--texto);
    font: 15px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  main {
    max-width: 520px; width: 100%; background: var(--card);
    border: 1px solid var(--borda); border-radius: 14px; padding: 32px;
    box-shadow: 0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.06);
  }
  .marca {
    display: flex; align-items: center; gap: 12px; margin-bottom: 24px;
  }
  .marca img { width: 40px; height: 40px; border-radius: 10px; }
  .marca span { font-size: 16px; font-weight: 600; letter-spacing: -.01em; }
  .selo {
    display: inline-flex; align-items: center; gap: 8px; font-size: 13px;
    font-weight: 600; color: var(--alerta); background: var(--alerta-bg);
    border-radius: 999px; padding: 6px 12px; margin-bottom: 20px;
  }
  h1 { font-size: 21px; line-height: 1.3; margin: 0 0 12px; letter-spacing: -.01em; }
  p { margin: 0; color: var(--suave); }
  footer {
    margin-top: 28px; padding-top: 20px; border-top: 1px solid var(--borda);
    font-size: 13px; color: var(--suave);
  }
</style>
</head>
<body>
  <main>
    <!-- Servida pelo backend, mas na MESMA origem do frontend: o caminho
         absoluto alcança o arquivo estático normalmente. -->
    <div class="marca">
      <img src="/favicon.svg" alt="">
      <span>Checklist Comercial</span>
    </div>
    <div class="selo" role="img" aria-label="Erro">&#9888; Acesso não concluído</div>
    <h1>${escapar(titulo)}</h1>
    <p>${escapar(detalhe)}</p>
    <footer>Checklist Comercial &middot; acesso via RovalConnecta</footer>
  </main>
</body>
</html>`;
}
