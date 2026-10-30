import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Eu } from './tipos';

/**
 * Sessão atual. As permissões vêm do servidor a cada consulta — ele relê do
 * banco, então uma revogação no RovalConnecta aparece aqui no próximo refetch.
 */
export function useEu() {
  return useQuery({
    queryKey: ['eu'],
    queryFn: () => api.get<Eu>('/api/me'),
    staleTime: 60_000,
  });
}

export function pode(eu: Eu | undefined, chave: string): boolean {
  return Boolean(eu && (eu.adminLocal || eu.permissoes.includes(chave)));
}
