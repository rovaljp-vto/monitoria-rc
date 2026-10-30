import { Module } from '@nestjs/common';
import { SsoController } from './sso.controller';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [SessionModule],
  controllers: [SsoController],
})
export class SsoModule {}
