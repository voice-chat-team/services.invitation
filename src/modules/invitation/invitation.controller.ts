import { Controller } from '@nestjs/common';
import { InvitationService } from './invitation.service';
import { GrpcMethod } from '@nestjs/microservices';
import type {
  CreateInvitationRequest,
  CreateInvitationResponse,
} from '@voice-chat/contracts/gen/invitation';
@Controller()
export class InvitationController {
  constructor(private readonly invitationService: InvitationService) {}

  @GrpcMethod('InvitationService', 'CreateInvitation')
  async createInvitation(
    request: CreateInvitationRequest,
  ): Promise<CreateInvitationResponse> {
    const invitation = await this.invitationService.createInvitation(request);

    return { invitation };
  }
}
