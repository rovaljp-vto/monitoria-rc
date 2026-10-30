import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodIssueCode, type ZodIssue, type ZodSchema } from 'zod';

/**
 * Validação com Zod.
 *
 * Os schemas usam `.strict()`, reproduzindo o comportamento documentado em
 * API.md ("Campos extras → 400", `forbidNonWhitelisted`): um campo não
 * declarado é erro, não algo ignorado em silêncio.
 *
 * A mensagem sai como array de strings, igual ao envelope do RovalConnecta.
 *
 * **A mensagem é escrita para quem lê, não para quem programou.** Sem isto ela
 * sairia como `vendedorId: Required` — nome interno do campo e texto em
 * inglês, os dois errados: expõe o formato do schema a quem só deveria ver a
 * interface, e destoa de um sistema inteiramente em português. Aqui o campo
 * vira o rótulo que aparece na tela e o texto sai traduzido.
 */

/**
 * Campos do schema com o nome que a pessoa vê no formulário.
 *
 * Só precisa entrar aqui o que chega ao usuário. O que não estiver mapeado sai
 * sem o nome do campo — vago, mas sem revelar a estrutura interna.
 */
const ROTULO_CAMPO: Record<string, string> = {
  nome: 'Nome',
  lojaId: 'Loja',
  vendedorId: 'Vendedor(a)',
  canal: 'Canal do atendimento',
  dataReferencia: 'Data do atendimento',
  respostas: 'Respostas',
  resposta: 'Resposta',
  observacao: 'Observação',
  texto: 'Texto',
  descricao: 'Descrição',
  peso: 'Peso',
  ordem: 'Ordem',
  tipoResposta: 'Tipo de resposta',
  perguntas: 'Critérios',
  admissao: 'Data de admissão',
  ativo: 'Situação',
  ativa: 'Situação',
  mes: 'Mês',
  excelenteMin: 'Nota mínima de Excelente',
  bomMin: 'Nota mínima de Bom',
  regularMin: 'Nota mínima de Regular',
  metaBase: 'Meta mensal',
  metaRegular: 'Meta para Regular',
  metaCritico: 'Meta para Crítico',
  diaAlertaFimMes: 'Dia do alerta de fim de mês',
};

/** O nome do campo como a tela o chama, ou nada se não for de exibir. */
function rotular(caminho: (string | number)[]): string | null {
  // Do fim para o começo: em `respostas.0.resposta`, o que interessa é o campo.
  for (let i = caminho.length - 1; i >= 0; i--) {
    const parte = caminho[i];
    if (typeof parte === 'string' && ROTULO_CAMPO[parte]) return ROTULO_CAMPO[parte];
  }
  return null;
}

/**
 * O problema em português.
 *
 * O Zod escreve em inglês e fala de tipos ("Expected string, received number").
 * Quem preenche um formulário não pensa em tipo — pensa em "faltou" e "está
 * fora do tamanho".
 */
function traduzir(issue: ZodIssue): string {
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      return issue.received === 'undefined' || issue.received === 'null'
        ? 'é obrigatório.'
        : 'está em um formato que o sistema não aceita.';
    case ZodIssueCode.too_small:
      return typeof issue.minimum === 'number' && issue.type === 'string'
        ? `precisa de pelo menos ${issue.minimum} caractere(s).`
        : 'está abaixo do mínimo aceito.';
    case ZodIssueCode.too_big:
      return typeof issue.maximum === 'number' && issue.type === 'string'
        ? `passa do limite de ${issue.maximum} caractere(s).`
        : 'está acima do máximo aceito.';
    case ZodIssueCode.invalid_enum_value:
      return 'tem um valor que não está entre as opções válidas.';
    case ZodIssueCode.invalid_string:
      return issue.validation === 'email'
        ? 'não parece um e-mail válido.'
        : issue.validation === 'uuid'
          ? 'não foi reconhecido.'
          : 'está em um formato inválido.';
    case ZodIssueCode.invalid_date:
      return 'não é uma data válida.';
    case ZodIssueCode.unrecognized_keys:
      // Não repete quais chaves sobraram: é exatamente o formato do schema.
      return 'A requisição trouxe campos que este recurso não aceita.';
    default:
      // Mensagem customizada do schema é texto nosso, escrito para o usuário.
      return issue.message;
  }
}

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const resultado = this.schema.safeParse(value);
    if (resultado.success) return resultado.data;

    const mensagens = resultado.error.issues.map((issue) => {
      const problema = traduzir(issue);
      // As frases de recurso inteiro (campo extra) já vêm completas.
      if (issue.code === ZodIssueCode.unrecognized_keys) return problema;

      const rotulo = rotular(issue.path);
      if (rotulo) return `${rotulo} ${problema}`;
      // Campo sem rótulo: diz o que houve sem nomear a estrutura interna.
      return `Um dos campos enviados ${problema}`;
    });

    // Sem duplicatas: um array com o mesmo aviso repetido não ajuda ninguém.
    throw new BadRequestException([...new Set(mensagens)]);
  }
}

/** Açúcar para usar direto no parâmetro: `@Body(zodPipe(Schema)) dto: Tipo`. */
export function zodPipe<T>(schema: ZodSchema<T>): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}
