import { Injectable } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { AbstractGrpcClient, InjectGrpcClient } from '@voice-chat/common';
import type { NotificationServiceClient } from '@voice-chat/contracts/gen/notification';

@Injectable()
export class NotificationClientGrpc extends AbstractGrpcClient<NotificationServiceClient> {
  constructor(@InjectGrpcClient('NOTIFICATION_PACKAGE') client: ClientGrpc) {
    super(client, 'NotificationService');
  }
}
