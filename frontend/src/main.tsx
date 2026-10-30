import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import '@fontsource-variable/inter';
import '@fontsource-variable/bodoni-moda';
import { ApiError } from '@/lib/api';
import { App } from './App';
import './styles.css';
// Outubro Rosa: faíscas rosas no clique durante outubro (igual ao RovalConnecta).
import "./lib/outubro-rosa.js";

/**
 * Sistema atualizado com a aba aberta: o bundle antigo não existe mais no
 * servidor. Recarrega sozinho, uma vez (padrão do Chamados TI).
 */
const CHAVE_RECARGA = 'monitoria:recarga-por-versao';
window.addEventListener('vite:preloadError', (evento) => {
  try {
    const ultima = Number(sessionStorage.getItem(CHAVE_RECARGA) ?? 0);
    if (Date.now() - ultima < 30_000) return;
    sessionStorage.setItem(CHAVE_RECARGA, String(Date.now()));
  } catch {
    return;
  }
  evento.preventDefault();
  window.location.reload();
});

const cliente = new QueryClient({
  queryCache: new QueryCache({
    // Sessão caiu no meio do uso (bloqueio ou revogação no hub, inatividade):
    // qualquer consulta que receba 401 leva à tela de acesso.
    onError: (erro) => {
      if (erro instanceof ApiError && erro.sessaoInvalida && window.location.pathname !== '/entrar') {
        window.location.assign('/entrar?sessao=encerrada');
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (tentativas, erro) => (erro instanceof ApiError && erro.status < 500 ? false : tentativas < 2),
    },
    mutations: { retry: false },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Quem pediu menos movimento no sistema operacional recebe só opacidade. */}
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={cliente}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </MotionConfig>
  </StrictMode>,
);
