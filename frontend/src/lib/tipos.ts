import type { Faixa, Resposta, TipoResposta } from '@motor';

export type { Faixa, Resposta, TipoResposta };

export type Slug = 'vendedores' | 'lojas';
export type TipoModulo = 'VENDEDOR' | 'LOJA';
export type Canal = 'BALCAO' | 'WHATSAPP';

export const PERM = {
  VENDEDORES_VER: 'MON_VENDEDORES_VER',
  VENDEDORES_REGISTRAR: 'MON_VENDEDORES_REGISTRAR',
  LOJAS_VER: 'MON_LOJAS_VER',
  LOJAS_REGISTRAR: 'MON_LOJAS_REGISTRAR',
  CADASTROS: 'MON_CADASTROS_GERENCIAR',
} as const;

export interface DefinicaoPermissao {
  key: string;
  nome: string;
  descricao: string;
  categoria: string;
}

export interface Eu {
  id: string;
  nome: string;
  username: string;
  filial: string | null;
  setor: string | null;
  adminLocal: boolean;
  permissoes: string[];
  catalogo: DefinicaoPermissao[];
  timezone: string;
  rovalConnectaUrl: string;
}

export interface Loja {
  id: string;
  nome: string;
  ativa: boolean;
  ordem: number;
  _count?: { vendedores: number };
}

export interface Vendedor {
  id: string;
  nome: string;
  ativo: boolean;
  admissao: string | null;
  inativadoEm: string | null;
  loja: { id: string; nome: string };
  /** Código do funcionário no RovalConnecta — chave da replicação. */
  codigoFuncionario?: string | null;
  /** `true` = cadastro e lotação vêm replicados do RovalConnecta: nome,
   *  situação e transferência se alteram lá. Só a admissão é local. */
  rovalManaged?: boolean;
}

export interface Parametros {
  excelenteMin: number;
  bomMin: number;
  regularMin: number;
  metaBase: number;
  metaRegular: number;
  metaCritico: number;
  diaAlertaFimMes: number;
}

export interface Pergunta {
  id: string;
  texto: string;
  descricao: string | null;
  tipoResposta: TipoResposta;
  peso: number;
  ordem: number;
  mensagemSim: string | null;
  mensagemNao: string | null;
}

export interface VersaoChecklist {
  id: string;
  numero: number;
  vigenteDesde: string;
  ativa: boolean;
  perguntas: Pergunta[];
  checklist?: { nome: string; tipo: TipoModulo };
  criadaPor?: { nome: string } | null;
  _count?: { monitorias: number };
}

export interface ItemCobertura {
  id: string;
  nome: string;
  lojaId: string;
  lojaNome: string;
  avaliado: boolean;
  monitorias: number;
  mediaMes: number | null;
  faixaMes: Faixa | null;
  ultimaData: string | null;
  ultimaNota: number | null;
  emFoco: boolean;
  metaMes: number;
}

export interface Cobertura {
  mes: string;
  ehMesAtual: boolean;
  resumo: {
    total: number;
    avaliados: number;
    pendentes: number;
    cobertura: number;
    monitorias: number;
    mediaGeral: number | null;
    porFaixa: Record<Faixa, number>;
    emFoco: number;
    diasRestantes: number | null;
    alertaFimDeMes: boolean;
    diaAlerta: number;
  };
  porLoja: { lojaId: string; lojaNome: string; total: number; avaliados: number }[];
  itens: ItemCobertura[];
}

export interface Foco {
  mes: string;
  metas: { regular: number; critico: number };
  itens: {
    id: string;
    nome: string;
    lojaNome: string;
    nota: number;
    faixa: Faixa;
    origem: 'MES' | 'ANTERIOR';
    meta: number;
    realizadas: number;
    faltam: number;
  }[];
}

export interface MonitoriaResumo {
  id: string;
  dataReferencia: string;
  canal: Canal | null;
  nota: number;
  faixa: Faixa;
  loja: { id: string; nome: string };
  vendedor: { id: string; nome: string } | null;
  avaliador: { nome: string };
  _count: { observacoes: number };
}

export interface ListaMonitorias {
  total: number;
  pagina: number;
  porPagina: number;
  itens: MonitoriaResumo[];
}

export interface Observacao {
  id: string;
  texto: string;
  criadaEm: string;
  autor: string;
  /** Ids das imagens — o conteúdo vem de /api/imagens/:id. */
  imagens: string[];
}

export interface MonitoriaDetalhe {
  id: string;
  tipo: TipoModulo;
  loja: { id: string; nome: string };
  vendedor: { id: string; nome: string } | null;
  canal: Canal | null;
  dataReferencia: string;
  mesRef: string;
  criadaEm: string;
  avaliador: string;
  versaoChecklist: number;
  nota: number;
  faixa: Faixa;
  respostas: {
    pergunta: string;
    descricao: string | null;
    pesoOriginal: number;
    pesoEfetivo: number;
    pontos: number;
    resposta: Resposta;
    observacao: string | null;
    /** Mensagem ao avaliado conforme a resposta (definida no checklist). */
    mensagem: string | null;
  }[];
  observacoes: Observacao[];
  feedbacks: Feedback[];
  podeObservar: boolean;
  /** Esta monitoria é uma retificação de outra (edição com motivo). */
  retificacao: { originalId: string; motivo: string } | null;
  /** Esta monitoria foi corrigida por outra — a vigente é a apontada aqui. */
  retificadaPor: { id: string; criadaEm: string; avaliador: string } | null;
  podeRetificar: boolean;
}

/** Dados do formulário de edição (retificação): versão original + respostas atuais. */
export interface FormularioRetificacao {
  id: string;
  tipo: TipoModulo;
  lojaId: string;
  vendedorId: string | null;
  canal: Canal | null;
  dataReferencia: string;
  versao: { id: string; numero: number; checklist: { nome: string; tipo: TipoModulo }; perguntas: Pergunta[] };
  respostas: { perguntaId: string; resposta: Resposta; observacao: string | null }[];
}

export interface Feedback {
  id: string;
  autoavaliacao: number | null;
  pontosFortes: string | null;
  pontosMelhorar: string | null;
  combinados: string | null;
  realizadoEm: string;
  autor: string;
  imagens: string[];
}

export interface HistoricoAlvo {
  alvo: { id: string; nome: string; ativo?: boolean; ativa?: boolean; loja?: { id: string; nome: string } };
  porMes: { mes: string; monitorias: number; media: number; faixa: Faixa }[];
  porCriterio: { criterio: string; aplicavel: number; percentualSim: number | null }[];
  monitorias: {
    id: string;
    dataReferencia: string;
    mesRef: string;
    canal: Canal | null;
    nota: number;
    faixa: Faixa;
    avaliador: string;
    loja: string;
    respostas: { criterio: string; resposta: Resposta }[];
  }[];
}

export interface UsuarioLocal {
  id: string;
  nome: string;
  username: string;
  codigoFuncionario: string | null;
  filial: string | null;
  setor: string | null;
  estado: 'PENDENTE' | 'ATIVO' | 'BLOQUEADO' | 'EXCLUIDO';
  isAdminLocal: boolean;
  linkedToRoval: boolean;
  ultimoAcessoEm: string | null;
  lastRovalSyncAt: string | null;
  permissoes: { chave: string }[];
}

export interface UsuarioDemo {
  id: string;
  nome: string;
  codigoFuncionario: string | null;
  lotacao: string;
  estado: string;
  papel: string;
  qtdPermissoes: number;
}
