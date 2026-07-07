import { Global, Module } from '@nestjs/common';
import { GuildClientGrpc } from './guild.grpc';
import { GrpcModule } from '@voice-chat/common';

@Global()
@Module({
  imports: [GrpcModule.register(['GUILD_PACKAGE'])],
  providers: [GuildClientGrpc],
  exports: [GuildClientGrpc],
})
export class GuildModule {}
