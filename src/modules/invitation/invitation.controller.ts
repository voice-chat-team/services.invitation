import { Controller } from '@nestjs/common';
import { InvitationService } from './invitation.service';
import { GrpcMethod } from '@nestjs/microservices';
import type {
  AcceptInvitationRequest,
  AcceptInvitationResponse,
  CreateInvitationRequest,
  CreateInvitationResponse,
  GetInvitationsRequest,
  GetInvitationsResponse,
  RevokeInvitationRequest,
  RevokeInvitationResponse,
} from '@voice-chat/contracts/gen/invitation';
import { InvitationStatus } from 'prisma/generated/enums';
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

  @GrpcMethod('InvitationService', 'GetInvitations')
  async getUserInvitations(
    request: GetInvitationsRequest,
  ): Promise<GetInvitationsResponse> {
    const invitation = await this.invitationService.getUserInvitations(request);
    return { invitation };
  }

  @GrpcMethod('InvitationService', 'AcceptInvitation')
  async acceptInvitation(
    request: AcceptInvitationRequest,
  ): Promise<AcceptInvitationResponse> {
    await this.invitationService.updateInvitation(
      request,
      InvitationStatus.ACCEPTED,
    );
    return { success: true };
  }

  @GrpcMethod('InvitationService', 'RevokeInvitation')
  async revokeInvitation(
    request: RevokeInvitationRequest,
  ): Promise<RevokeInvitationResponse> {
    await this.invitationService.updateInvitation(
      request,
      InvitationStatus.DECLINED,
    );
    return { success: true };
  }
}
