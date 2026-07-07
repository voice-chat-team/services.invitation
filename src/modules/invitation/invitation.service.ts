import { Injectable } from '@nestjs/common';
import {
  type CreateInvitationRequest,
  type Invitation,
} from '@voice-chat/contracts/gen/invitation';
import { GRPC_INVITATION_STATUS } from '../../shared/mapper/invitation-status.map';
import { InvitationStatus } from 'prisma/generated/enums';
import { GuildClientGrpc } from '../guild/guild.grpc';
import { RpcException } from '@nestjs/microservices';
import { RpcStatus } from '@voice-chat/common';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { CentrifugoService } from 'src/infrastructure/centrifugo/centrifugo.service';

@Injectable()
export class InvitationService {
  constructor(
    private readonly guildClient: GuildClientGrpc,
    private readonly prisma: PrismaService,
    private readonly centrifugoService: CentrifugoService,
  ) {}

  async createInvitation(
    request: CreateInvitationRequest,
  ): Promise<Invitation> {
    if (request.receiverId === request.senderId) {
      throw new RpcException({
        code: RpcStatus.INVALID_ARGUMENT,
        details: 'Нельзя пригласить самого себя',
      });
    }

    try {
      const receiverMember = await this.guildClient.call('getMemberById', {
        userId: request.receiverId,
        guildId: request.guildId,
      });
      if (receiverMember.memberInfo) {
        throw new RpcException({
          code: RpcStatus.NOT_FOUND,
          details: 'Пользователь уже является участником сервера',
        });
      }
    } catch (error) {
      if ('error' in error) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        throw new RpcException(error.error);
      }
      throw new RpcException({
        code: RpcStatus.INTERNAL,
        details: 'Ошибка получателя',
      });
    }

    const senderMember = await this.guildClient.call('getMemberById', {
      userId: request.senderId,
      guildId: request.guildId,
    });

    if (!senderMember.memberInfo?.isGuildOwner) {
      throw new RpcException({
        code: RpcStatus.NOT_FOUND,
        details: 'Отправлять приглашение может только владелец сервера',
      });
    }

    try {
      const invitation = await this.prisma.invitation.create({
        data: {
          ...request,
          receiverId: request.receiverId,
          senderId: request.senderId,
          guildId: request.guildId,
          status: InvitationStatus.PENDING,
          invitedRole: request.invitedRole,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      await this.centrifugoService.publish(`user#${request.receiverId}`, {
        type: 'INVITATION_CREATED',
        payload: invitation,
      });

      return {
        id: invitation.id,
        guildId: invitation.guildId,
        senderId: invitation.senderId,
        receiverId: invitation.receiverId,
        status: GRPC_INVITATION_STATUS.PENDING,
        invitedRole: invitation.invitedRole,
        expiresAt: invitation.expiresAt.toISOString(),
        createdAt: invitation.createdAt.toISOString(),
      };
    } catch {
      throw new RpcException({
        code: RpcStatus.INVALID_ARGUMENT,
        details: 'Не удалось отправить приглашение',
      });
    }
  }
}
