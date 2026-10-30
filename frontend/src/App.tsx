import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { ApiError } from '@/lib/api';
import { useEu, pode } from '@/lib/sessao';
import { moduloDoSlug } from '@/lib/modulos';
import { PERM } from '@/lib/tipos';
import { CarregandoTela, ErroTela } from '@/components/ui';
import { LayoutInterno } from '@/components/Layout';
import { Entrar } from '@/pages/Entrar';
import { Inicio } from '@/pages/Inicio';

// Telas internas sob demanda: a tela de acesso e a home abrem sem esperar por elas.
const Cobertura = lazy(() => import('@/pages/modulo/Cobertura'));
const Dashboard = lazy(() => import('@/pages/modulo/Dashboard'));
const NovaMonitoria = lazy(() => import('@/pages/modulo/NovaMonitoria'));
const Foco = lazy(() => import('@/pages/modulo/Foco'));
const Monitorias = lazy(() => import('@/pages/modulo/Monitorias'));
const Alvo = lazy(() => import('@/pages/modulo/Alvo'));
const DetalheMonitoria = lazy(() => import('@/pages/DetalheMonitoria'));
const Administracao = lazy(() => import('@/pages/admin/Administracao'));
const Feedback = lazy(() => import('@/pages/Feedback'));

/** Sem sessão válida → tela "Entre pelo RovalConnecta". */
function ComSessao({ children }: { children: ReactNode }) {
  const eu = useEu();
  if (eu.isPending) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <CarregandoTela />
      </div>
    );
  }
  if (eu.error) {
    if (eu.error instanceof ApiError && eu.error.status === 401) return <Navigate to="/entrar" replace />;
    return (
      <div className="mx-auto max-w-6xl p-6">
        <ErroTela erro={eu.error} onTentar={() => eu.refetch()} />
      </div>
    );
  }
  return <>{children}</>;
}

/** O módulo da URL existe e a pessoa pode vê-lo (o servidor confere de novo). */
function ComModulo({ children, registrar = false }: { children: ReactNode; registrar?: boolean }) {
  const { modulo } = useParams();
  const { data: eu } = useEu();
  const cfg = moduloDoSlug(modulo);
  if (!cfg) return <Navigate to="/" replace />;
  if (!pode(eu, cfg.perm.ver) || (registrar && !pode(eu, cfg.perm.registrar))) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function ComCadastros({ children }: { children: ReactNode }) {
  const { data: eu } = useEu();
  return pode(eu, PERM.CADASTROS) ? <>{children}</> : <Navigate to="/" replace />;
}

const carregando = (
  <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
    <CarregandoTela />
  </div>
);

export function App() {
  return (
    <Routes>
      <Route path="/entrar" element={<Entrar />} />
      <Route
        path="/"
        element={
          <ComSessao>
            <Inicio />
          </ComSessao>
        }
      />
      {/* Apresentação em tela cheia: fora da casca, sem menu lateral. */}
      <Route
        path="/monitoria/:id/feedback"
        element={
          <ComSessao>
            <Suspense fallback={carregando}>
              <Feedback />
            </Suspense>
          </ComSessao>
        }
      />
      <Route
        element={
          <ComSessao>
            <LayoutInterno />
          </ComSessao>
        }
      >
        <Route
          path="/admin/*"
          element={
            <ComCadastros>
              <Suspense fallback={carregando}>
                <Administracao />
              </Suspense>
            </ComCadastros>
          }
        />
        <Route
          path="/monitoria/:id"
          element={
            <Suspense fallback={carregando}>
              <DetalheMonitoria />
            </Suspense>
          }
        />
        <Route path="/:modulo" element={<ComModulo><Suspense fallback={carregando}><Cobertura /></Suspense></ComModulo>} />
        <Route path="/:modulo/nova" element={<ComModulo registrar><Suspense fallback={carregando}><NovaMonitoria /></Suspense></ComModulo>} />
        <Route path="/:modulo/dashboard" element={<ComModulo><Suspense fallback={carregando}><Dashboard /></Suspense></ComModulo>} />
        <Route path="/:modulo/foco" element={<ComModulo><Suspense fallback={carregando}><Foco /></Suspense></ComModulo>} />
        <Route path="/:modulo/monitorias" element={<ComModulo><Suspense fallback={carregando}><Monitorias /></Suspense></ComModulo>} />
        <Route path="/:modulo/alvo/:id" element={<ComModulo><Suspense fallback={carregando}><Alvo /></Suspense></ComModulo>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
