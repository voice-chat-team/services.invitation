import { Controller } from '@nestjs/common';
import { InvitationService } from './invitation.service';

@Controller()
export class InvitationController {
  constructor(private readonly invitationService: InvitationService) {}
}
