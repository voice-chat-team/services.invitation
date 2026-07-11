import { Injectable } from '@nestjs/common';
import type {
  AcceptInvitationRequest,
  GetInvitationsRequest,
  CreateInvitationRequest,
  Invitation,
} from '@voice-chat/contracts/gen/invitation';
import { GRPC_INVITATION_STATUS } from '../../shared/mapper/invitation-status.map';
import { InvitationStatus } from 'prisma/generated/enums';
import { GuildClientGrpc } from '../guild/guild.grpc';
import { RpcException } from '@nestjs/microservices';
import { RpcStatus } from '@voice-chat/common';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { CentrifugoService } from 'src/infrastructure/centrifugo/centrifugo.service';
import { UserClientGrpc } from '../user/user.grpc';
import { InvitationModel } from 'prisma/generated/models';

@Injectable()
export class InvitationService {
  constructor(
    private readonly userClient: UserClientGrpc,
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

    const reciverUserInfo = await this.userClient.call('getUser', {
      userId: request.receiverId,
      username: request.receiverUsername,
    });

    if (!reciverUserInfo.user) {
      throw new RpcException({
        code: RpcStatus.NOT_FOUND,
        details: 'Пользователь не найден',
      });
    }

    try {
      const receiverMember = await this.guildClient.call('getMemberById', {
        guildId: request.guildId,
        userId: reciverUserInfo.user?.id,
      });
      if (receiverMember.memberInfo) {
        throw new RpcException({
          code: RpcStatus.NOT_FOUND,
          details: 'Пользователь уже является участником сервера',
        });
      }
    } catch (error) {
      console.error(error);
      if ('error' in error) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        throw new RpcException(error.error);
      }
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
          receiverId: reciverUserInfo.user?.id,
          senderId: request.senderId,
          guildId: request.guildId,
          status: InvitationStatus.PENDING,
          invitedRole: request.invitedRole,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      const invitationResponse = (
        await this._mapInvitationsToResponse([invitation])
      )[0];

      await this.centrifugoService.publish(`personal:#${request.receiverId}`, {
        type: 'NEW_INVITATION',
        payload: invitationResponse,
      });

      return invitationResponse;
    } catch (error) {
      console.error(error);
      throw new RpcException({
        code: RpcStatus.INVALID_ARGUMENT,
        details: 'Не удалось отправить приглашение',
      });
    }
  }

  async getUserInvitations(
    request: GetInvitationsRequest,
  ): Promise<Invitation[]> {
    const { guildId, receiverId, senderId } = request;

    const invitations = await this.prisma.invitation.findMany({
      where: {
        guildId,
        receiverId,
        senderId,
      },
    });

    return this._mapInvitationsToResponse(invitations);
  }

  async updateInvitation(
    request: AcceptInvitationRequest,
    newStatus: InvitationStatus,
  ) {
    const invitation = await this.prisma.invitation.findUnique({
      where: {
        id: request.invitationId,
        receiverId: request.userId,
      },
    });

    if (!invitation) {
      throw new RpcException({
        code: RpcStatus.NOT_FOUND,
        details: 'Приглашение не найдено',
      });
    }

    try {
      await this.prisma.invitation.update({
        where: {
          id: invitation.id,
        },
        data: {
          status: newStatus,
        },
      });

      await this.centrifugoService.publish(`guild:${invitation.guildId}`, {
        type: 'UPDATE_INVITATION',
        payload: (await this._mapInvitationsToResponse([invitation]))[0],
      });
    } catch (error) {
      console.log(error);

      throw new RpcException({
        code: RpcStatus.INTERNAL,
        details: 'Ошибка при обновлении статуса приглашения',
      });
    }
  }

  private async _mapInvitationsToResponse(
    invitations: InvitationModel[],
  ): Promise<Invitation[]> {
    const receiverUsersIds = invitations.map(
      (invitation) => invitation.receiverId,
    );
    const senderUsersIds = invitations.map((invitation) => invitation.senderId);
    const usersInfo = await this.userClient.call('getRangeUsersById', {
      usersId: [...receiverUsersIds, ...senderUsersIds],
    });

    return invitations.map((invitation) => ({
      ...invitation,
      status: GRPC_INVITATION_STATUS[invitation.status],
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
      receiverInfo: usersInfo.users.find(
        (user) => user.id === invitation.receiverId,
      ),
      senderInfo: usersInfo.users.find(
        (user) => user.id === invitation.senderId,
      ),
    }));
  }
}
