import { Global, Module } from '@nestjs/common';
import { NotificationClientGrpc } from './notification.grpc';
import { GrpcModule } from '@voice-chat/common';

@Global()
@Module({
  imports: [GrpcModule.register(['NOTIFICATION_PACKAGE'])],
  providers: [NotificationClientGrpc],
  exports: [NotificationClientGrpc],
})
export class NotificationModule {}
