import { Module } from '@nestjs/common';
import { InvitationService } from './invitation.service';
import { InvitationController } from './invitation.controller';
import { InvitationExpirationWorker } from './invitation-expiration.worker';

@Module({
  controllers: [InvitationController],
  providers: [InvitationService, InvitationExpirationWorker],
})
export class InvitationModule {}
