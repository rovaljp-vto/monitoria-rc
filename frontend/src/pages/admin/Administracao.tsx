import { Navigate, Route, Routes } from 'react-router-dom';
import { Cabecalho } from '@/components/Layout';
import { AdminLojas } from './Lojas';
import { AdminVendedores } from './Vendedores';
import { AdminChecklist } from './Checklist';
import { AdminParametros } from './Parametros';
import { AdminUsuarios } from './Usuarios';
import { AdminAuditoria } from './Auditoria';

/**
 * Escopo §4.6 — cadastros e parâmetros comuns aos dois módulos. As seções são
 * escolhidas no menu lateral (grupo "Administração").
 *
 * Redirecionamentos com caminho ABSOLUTO: esta tela vive numa rota com splat
 * (/admin/*), e no React Router 7 um destino relativo ali é resolvido a partir
 * da URL atual — "lojas" dentro de /admin/abc virava /admin/abc/lojas, em laço.
 */
const SECOES = [
  { caminho: 'lojas', titulo: 'Lojas', descricao: 'Lojas inativas saem da cobertura sem perder o histórico.', elemento: <AdminLojas /> },
  { caminho: 'vendedores', titulo: 'Vendedores', descricao: 'Inativar tira da cobertura do mês; trocar a loja é uma transferência.', elemento: <AdminVendedores /> },
  { caminho: 'checklist-vendedores', titulo: 'Checklist de vendedores', descricao: 'Critérios e pesos do módulo Vendedores.', elemento: <AdminChecklist slug="vendedores" /> },
  { caminho: 'checklist-lojas', titulo: 'Checklist de lojas', descricao: 'Critérios e pesos do módulo Lojas.', elemento: <AdminChecklist slug="lojas" /> },
  { caminho: 'parametros', titulo: 'Faixas e metas', descricao: 'Faixas de nota, metas de monitoria e alerta de fim de mês.', elemento: <AdminParametros /> },
  { caminho: 'usuarios', titulo: 'Usuários', descricao: 'Pessoas replicadas do RovalConnecta e suas permissões.', elemento: <AdminUsuarios /> },
  { caminho: 'auditoria', titulo: 'Auditoria', descricao: 'Tudo o que foi feito no sistema, por quem e quando. Visível só para o administrador do RovalConnecta.', elemento: <AdminAuditoria /> },
];

export default function Administracao() {
  return (
    <Routes>
      <Route index element={<Navigate to="/admin/lojas" replace />} />
      {SECOES.map((s) => (
        <Route
          key={s.caminho}
          path={s.caminho}
          element={
            <>
              <Cabecalho sobre="Administração" titulo={s.titulo} descricao={s.caminho === 'auditoria' ? s.descricao : `${s.descricao} Mudanças aqui são registradas na auditoria.`} />
              {s.elemento}
            </>
          }
        />
      ))}
      <Route path="*" element={<Navigate to="/admin/lojas" replace />} />
    </Routes>
  );
}
