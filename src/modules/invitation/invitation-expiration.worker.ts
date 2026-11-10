import { Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InvitationService } from './invitation.service';

@Injectable()
export class InvitationExpirationWorker implements OnApplicationBootstrap {
  private readonly logger = new Logger(InvitationExpirationWorker.name);
  private running = false;
  private cursor?: string;

  constructor(private readonly invitationService: InvitationService) {}

  onApplicationBootstrap() {
    void this.handleExpiration();
  }

  @Cron(CronExpression.EVERY_MINUTE, {
    name: 'expire-invitations',
    waitForCompletion: true,
  })
  async handleExpiration() {
    // Защищает также от пересечения стартового запуска с cron.
    if (this.running) return;
    this.running = true;

    try {
      this.cursor = await this.invitationService.expireInvitations(this.cursor);
    } catch (error) {
      this.logger.error('Не удалось проверить сроки приглашений', error);
    } finally {
      this.running = false;
    }
  }
}
