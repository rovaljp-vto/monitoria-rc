import { Controller, Get, Module } from '@nestjs/common';
import { RequerPermissao } from '../../common/decorators';
import { PERMISSOES } from '../../common/constants/permissions';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Usuários replicados — SOMENTE LEITURA.
 *
 * GUIA-INTEGRACAO §13.2, item 5: para usuários de origem Roval a tela local de
 * permissões mostra "Gerenciado pelo RovalConnecta" e não edita nada. Não há
 * rota de escrita aqui de propósito: quem concede e revoga é o hub.
 */
@Controller('api/usuarios')
class UsuariosController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequerPermissao(PERMISSOES.CADASTROS_GERENCIAR)
  listar() {
    return this.prisma.usuario.findMany({
      orderBy: [{ isAdminLocal: 'desc' }, { estado: 'asc' }, { nome: 'asc' }],
      select: {
        id: true,
        nome: true,
        username: true,
        codigoFuncionario: true,
        filial: true,
        setor: true,
        estado: true,
        isAdminLocal: true,
        linkedToRoval: true,
        ultimoAcessoEm: true,
        lastRovalSyncAt: true,
        permissoes: { select: { chave: true } },
      },
    });
  }
}

@Module({ controllers: [UsuariosController] })
export class UsuariosModule {}
