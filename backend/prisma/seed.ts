/**
 * Seed — idempotente: pode rodar de novo sem duplicar nada.
 *
 *   npm run seed        → base de produção: admin local, 5 lojas, os dois
 *                         checklists v1 (pesos sugeridos no escopo §3.1/§3.2)
 *                         e os parâmetros padrão (§3.4).
 *   npm run seed:demo   → base + dados FICTÍCIOS para homologação: usuários de
 *                         cada perfil, vendedores e três meses de monitorias.
 *                         Nunca rode em produção.
 */
import { Prisma, PrismaClient, TipoModulo, type TipoResposta } from '@prisma/client';
import { calcularNota, type Resposta } from '../src/common/nota/motor';
import { mesDe } from '../src/common/tempo/mes';
import { MENSAGENS_PADRAO } from './mensagens-padrao';

// O ts-node não lê o .env (quem lê é a CLI do Prisma e o Nest); sem isto o
// `npm run seed` falha com "Environment variable not found: DATABASE_URL".
try {
  process.loadEnvFile('.env');
} catch {
  /* sem .env: vale o ambiente do processo */
}

const prisma = new PrismaClient();
const TIMEZONE = process.env.TIMEZONE || 'America/Sao_Paulo';

const LOJAS = ['Pedro II', 'Mag Shopping', 'Epitácio', 'Pátio Altiplano', 'B2C'];

type Criterio = { texto: string; descricao?: string; tipoResposta: TipoResposta; peso: number };

/** Escopo §3.1 — herdado do Forms "Checklist de Atendimento – Vendedor". */
const CHECKLIST_VENDEDOR: Criterio[] = [
  { texto: 'Saudação inicial', descricao: 'Bom dia / Boa tarde / Boa noite.', tipoResposta: 'SIM_NAO', peso: 10 },
  { texto: 'Apresentação cordial', tipoResposta: 'SIM_NAO', peso: 10 },
  { texto: 'Identificação do cliente', descricao: 'Cadastro / nome do cliente.', tipoResposta: 'SIM_NAO', peso: 10 },
  { texto: 'Condução do atendimento', descricao: 'Perguntas abertas e objetivas.', tipoResposta: 'SIM_NAO', peso: 20 },
  { texto: 'Interação ativa durante o atendimento', tipoResposta: 'SIM_NAO', peso: 15 },
  { texto: 'Postura e comunicação', tipoResposta: 'SIM_NAO', peso: 15 },
  { texto: 'Upselling', descricao: 'Oferta complementar.', tipoResposta: 'SIM_NAO_NA', peso: 20 },
];

/** Escopo §3.2 — proposta inicial, a ajustar com o monitor de lojas. */
const CHECKLIST_LOJA: Criterio[] = [
  { texto: 'Organização e limpeza do ambiente', tipoResposta: 'SIM_NAO', peso: 20 },
  { texto: 'Vitrine e exposição de produtos no padrão', tipoResposta: 'SIM_NAO', peso: 20 },
  { texto: 'Comunicação visual / campanhas vigentes aplicadas', tipoResposta: 'SIM_NAO_NA', peso: 15 },
  { texto: 'Estrutura e equipamentos em ordem', tipoResposta: 'SIM_NAO', peso: 15 },
  { texto: 'Processos operacionais seguidos', descricao: 'Abertura, caixa, cadastro.', tipoResposta: 'SIM_NAO', peso: 15 },
  { texto: 'Clima e postura geral da equipe', tipoResposta: 'SIM_NAO', peso: 15 },
];

async function base() {
  // Admin local pré-existente: é nele que o superAdmin do hub é vinculado
  // (GUIA-INTEGRACAO §6.2). Nunca se cria um segundo.
  const admin = await prisma.usuario.findFirst({ where: { isAdminLocal: true } });
  if (!admin) {
    await prisma.usuario.create({
      data: { nome: 'Administrador', username: 'admin', isAdminLocal: true, estado: 'ATIVO', origem: 'LOCAL' },
    });
    console.log('✓ admin local criado');
  }

  for (const [ordem, nome] of LOJAS.entries()) {
    await prisma.loja.upsert({ where: { nome }, create: { nome, ordem }, update: {} });
  }
  console.log(`✓ ${LOJAS.length} lojas`);

  await checklist(TipoModulo.VENDEDOR, 'Checklist de Atendimento — Vendedor', CHECKLIST_VENDEDOR);
  await checklist(TipoModulo.LOJA, 'Checklist de Loja', CHECKLIST_LOJA);

  await prisma.parametros.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  console.log('✓ parâmetros');
}

/** Cria a v1 só se o checklist ainda não tem versão — nunca sobrescreve ajustes feitos na tela. */
async function checklist(tipo: TipoModulo, nome: string, criterios: Criterio[]) {
  const c = await prisma.checklist.upsert({ where: { tipo }, create: { tipo, nome }, update: {} });
  const existe = await prisma.checklistVersao.count({ where: { checklistId: c.id } });
  if (existe) return;
  await prisma.checklistVersao.create({
    data: {
      checklistId: c.id,
      numero: 1,
      perguntas: {
        create: criterios.map((p, i) => ({
          ...p,
          ordem: i + 1,
          mensagemSim: MENSAGENS_PADRAO[p.texto]?.sim ?? null,
          mensagemNao: MENSAGENS_PADRAO[p.texto]?.nao ?? null,
        })),
      },
    },
  });
  console.log(`✓ checklist ${tipo} v1`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Demonstração
// ─────────────────────────────────────────────────────────────────────────────

const PERFIS_DEMO = [
  { codigo: '9001', nome: 'Monitora de Vendedores (demo)', permissoes: ['MON_VENDEDORES_VER', 'MON_VENDEDORES_REGISTRAR', 'MON_LOJAS_VER'] },
  { codigo: '9002', nome: 'Monitor de Lojas (demo)', permissoes: ['MON_LOJAS_VER', 'MON_LOJAS_REGISTRAR', 'MON_VENDEDORES_VER'] },
  { codigo: '9003', nome: 'Gestão (demo)', permissoes: ['MON_VENDEDORES_VER', 'MON_LOJAS_VER'] },
  { codigo: '9004', nome: 'Administração (demo)', permissoes: ['MON_CADASTROS_GERENCIAR', 'MON_VENDEDORES_VER', 'MON_LOJAS_VER'] },
  { codigo: '9005', nome: 'Sem permissões (demo)', permissoes: [] as string[] },
];

const NOMES = [
  'Ana Beatriz', 'Bruno Costa', 'Carla Mendes', 'Diego Rocha', 'Eduarda Lima', 'Felipe Araújo',
  'Gabriela Nunes', 'Henrique Souza', 'Isabela Freitas', 'João Pedro', 'Karina Alves', 'Lucas Martins',
  'Mariana Duarte', 'Nathan Ribeiro', 'Olívia Campos', 'Paulo Henrique', 'Queila Barros', 'Rafael Teixeira',
  'Sabrina Moura', 'Tiago Farias', 'Úrsula Pires', 'Vinícius Lopes', 'Wesley Cardoso', 'Yasmin Correia',
  'Amanda Vieira', 'Caio Monteiro', 'Débora Pinto', 'Emanuel Reis', 'Fernanda Dias', 'Gustavo Melo',
];

/** Pseudoaleatório determinístico: a demo sai igual toda vez. */
function sorteador(semente: number) {
  let s = semente;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
}

async function demo() {
  const lojas = await prisma.loja.findMany({ orderBy: { ordem: 'asc' } });

  const usuarios = [];
  for (const p of PERFIS_DEMO) {
    const u = await prisma.usuario.upsert({
      where: { codigoFuncionario: p.codigo },
      create: {
        codigoFuncionario: p.codigo,
        nome: p.nome,
        username: `${p.codigo}-DEMO`,
        estado: p.permissoes.length ? 'ATIVO' : 'PENDENTE',
        origem: 'LOCAL',
        permissoes: { create: p.permissoes.map((chave) => ({ chave })) },
      },
      update: {},
    });
    usuarios.push(u);
  }
  console.log(`✓ ${usuarios.length} usuários de demonstração`);

  if (await prisma.vendedor.count()) {
    console.log('• vendedores já existem — monitorias de demonstração não foram geradas de novo');
    return;
  }

  const inicio = new Date();
  inicio.setMonth(inicio.getMonth() - 3);
  const vendedores = [];
  for (const [i, nome] of NOMES.entries()) {
    vendedores.push(
      await prisma.vendedor.create({
        data: {
          nome,
          lojaId: lojas[i % lojas.length].id,
          criadoEm: inicio,
          // Lotação inicial (histórico vendedor↔loja).
          lotacoes: { create: { lojaId: lojas[i % lojas.length].id, dataInicio: new Date(`${inicio.toISOString().slice(0, 10)}T00:00:00Z`) } },
        },
      }),
    );
  }
  await prisma.loja.updateMany({ data: { criadaEm: inicio } });
  console.log(`✓ ${vendedores.length} vendedores fictícios`);

  const rnd = sorteador(42);
  const versaoV = await prisma.checklistVersao.findFirstOrThrow({ where: { ativa: true, checklist: { tipo: 'VENDEDOR' } }, include: { perguntas: true } });
  const versaoL = await prisma.checklistVersao.findFirstOrThrow({ where: { ativa: true, checklist: { tipo: 'LOJA' } }, include: { perguntas: true } });
  const monitoraV = usuarios[0];
  const monitorL = usuarios[1];

  async function registrar(tipo: TipoModulo, data: Date, lojaId: string, vendedorId: string | null, qualidade: number) {
    const versao = tipo === 'VENDEDOR' ? versaoV : versaoL;
    const respostas: Record<string, Resposta> = {};
    for (const p of versao.perguntas) {
      respostas[p.id] = p.tipoResposta === 'SIM_NAO_NA' && rnd() < 0.2 ? 'NA' : rnd() < qualidade ? 'SIM' : 'NAO';
    }
    const r = calcularNota(versao.perguntas, respostas);
    if (!r.ok) return;
    await prisma.monitoria.create({
      data: {
        tipo,
        vendedorId,
        lojaId,
        canal: tipo === 'VENDEDOR' ? (rnd() < 0.35 ? 'WHATSAPP' : 'BALCAO') : null,
        dataReferencia: data,
        mesRef: mesDe(data, TIMEZONE),
        avaliadorId: tipo === 'VENDEDOR' ? monitoraV.id : monitorL.id,
        versaoId: versao.id,
        nota: new Prisma.Decimal(r.nota),
        faixa: r.faixa,
        respostas: {
          create: r.itens.map((i) => ({
            perguntaId: i.criterioId,
            resposta: i.resposta,
            pesoEfetivo: new Prisma.Decimal(i.pesoEfetivo.toFixed(4)),
            pontos: new Prisma.Decimal(i.pontos.toFixed(4)),
          })),
        },
        ...(rnd() < 0.3
          ? { observacoes: { create: { autorId: tipo === 'VENDEDOR' ? monitoraV.id : monitorL.id, texto: 'Registro de demonstração: feedback dado pessoalmente, combinado reforço no ponto fraco.' } } }
          : {}),
      },
    });
  }

  let total = 0;
  const hoje = new Date();
  // Dois meses completos para trás + o mês corrente pela metade (para a
  // cobertura mostrar pendências de verdade).
  for (let atras = 2; atras >= 0; atras--) {
    const mes = new Date(hoje.getFullYear(), hoje.getMonth() - atras, 1);
    const ultimoDia = atras === 0 ? hoje.getDate() : new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
    for (const [i, v] of vendedores.entries()) {
      if (atras === 0 && rnd() < 0.45) continue; // pendentes no mês atual
      const qualidade = i % 7 === 0 ? 0.45 : i % 5 === 0 ? 0.65 : 0.88; // alguns em foco
      const vezes = qualidade < 0.7 && atras > 0 ? 2 : 1;
      for (let k = 0; k < vezes; k++) {
        const dia = 1 + Math.floor(rnd() * Math.max(1, ultimoDia - 1));
        await registrar('VENDEDOR', new Date(mes.getFullYear(), mes.getMonth(), dia, 10 + Math.floor(rnd() * 8), 0), v.lojaId, v.id, qualidade);
        total++;
      }
    }
    for (const [i, l] of lojas.entries()) {
      if (atras === 0 && i >= 3) continue;
      const dia = 1 + Math.floor(rnd() * Math.max(1, ultimoDia - 1));
      await registrar('LOJA', new Date(mes.getFullYear(), mes.getMonth(), dia, 9, 30), l.id, null, i === 2 ? 0.55 : 0.85);
      total++;
    }
  }
  console.log(`✓ ${total} monitorias fictícias`);
}

async function main() {
  await base();
  if (process.argv.includes('--demo')) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('seed --demo recusado com NODE_ENV=production: ele cria dados fictícios.');
    }
    await demo();
  }
}

main()
  .catch((e) => {
    console.error('✖', (e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
