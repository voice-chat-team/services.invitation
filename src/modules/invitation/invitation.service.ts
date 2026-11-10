import { Injectable } from '@nestjs/common';
import type {
  AcceptInvitationRequest,
  GetInvitationsRequest,
  CreateInvitationRequest,
  Invitation,
} from '@voice-chat/contracts/gen/ts/invitation';
import type { GetMemberByIdResponse } from '@voice-chat/contracts/gen/ts/guilds';
import { GRPC_INVITATION_STATUS } from '../../shared/mapper/invitation-status.map';
import { InvitationStatus } from 'prisma/generated/enums';
import { Prisma } from 'prisma/generated/client';
import { GuildClientGrpc } from '../guild/guild.grpc';
import { RpcException } from '@nestjs/microservices';
import { assertGuildPermission, RpcStatus } from '@voice-chat/common';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { UserClientGrpc } from '../user/user.grpc';
import type { InvitationModel } from 'prisma/generated/models';
import { NotificationClientGrpc } from '../notification/notification.grpc';
import { NotificationType, Permission } from '@voice-chat/contracts';
import { getRpcError, toRpcException } from './invitation-rpc-error';

type InvitationResponseStatus =
  typeof InvitationStatus.ACCEPTED | typeof InvitationStatus.DECLINED;

const EXPIRED_INVITATION_MESSAGE =
  'Срок приглашения истёк. Запросите новое приглашение.';

@Injectable()
export class InvitationService {
  constructor(
    private readonly userClient: UserClientGrpc,
    private readonly guildClient: GuildClientGrpc,
    private readonly notificationClient: NotificationClientGrpc,
    private readonly prisma: PrismaService,
  ) {}

  async createInvitation(
    request: CreateInvitationRequest,
  ): Promise<Invitation> {
    const receiverId = await this._resolveReceiverId(request);
    await this._assertReceiverNotMember(request.guildId, receiverId);
    const guild = await this._getGuildForInvitation(request);

    try {
      const invitation = await this._createPendingInvitation({
        receiverId,
        senderId: request.senderId,
        guildId: request.guildId,
        status: InvitationStatus.PENDING,
        invitedRole: request.invitedRole,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      try {
        return await this._sendInvitationNotification(invitation, guild.name);
      } catch (error: unknown) {
        await this.prisma.invitation.delete({ where: { id: invitation.id } });
        throw error;
      }
    } catch (error: unknown) {
      throw toRpcException(error, {
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

    return this._enrichInvitationsWithUsers(invitations);
  }

  async respondToInvitation(
    request: AcceptInvitationRequest,
    newStatus: InvitationResponseStatus,
  ) {
    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          const invitation = await this._findInvitationForUpdate(tx, request);

          if (!invitation) {
            throw new RpcException({
              code: RpcStatus.NOT_FOUND,
              details: 'Приглашение не найдено',
            });
          }

          if (this._isExpired(invitation)) {
            await this._expireInvitation(tx, invitation);
            return { expired: true, invitation };
          }

          if (
            invitation.status !== InvitationStatus.PENDING &&
            invitation.status !== newStatus
          ) {
            throw new RpcException({
              code: RpcStatus.FAILED_PRECONDITION,
              details: 'Приглашение уже обработано',
            });
          }

          if (newStatus === InvitationStatus.ACCEPTED) {
            await this.guildClient.call('joinUserToGuild', {
              guildId: invitation.guildId,
              userId: invitation.receiverId,
            });
          }

          const updatedInvitation = await tx.invitation.update({
            where: { id: invitation.id },
            data: { status: newStatus },
          });

          return { expired: false, invitation: updatedInvitation };
        },
        { timeout: 15_000 },
      );

      if (result.expired) {
        throw new RpcException({
          code: RpcStatus.FAILED_PRECONDITION,
          details: EXPIRED_INVITATION_MESSAGE,
        });
      }

      await this._updateInvitationNotification(result.invitation);
    } catch (error: unknown) {
      throw toRpcException(error, {
        code: RpcStatus.INTERNAL,
        details: 'Ошибка при обновлении статуса приглашения',
      });
    }
  }

  async expireInvitations(cursor?: string): Promise<string | undefined> {
    const batchSize = 100;

    return this.prisma.$transaction(
      async (tx) => {
        const invitations = await tx.$queryRaw<InvitationModel[]>`
          SELECT id,
            sender_id AS "senderId", receiver_id AS "receiverId",
            notification_id AS "notificationId", guild_id AS "guildId",
            status, invited_role AS "invitedRole", expires_at AS "expiresAt",
            created_at AS "createdAt", updated_at AS "updatedAt"
          FROM invitations
          WHERE status = 'PENDING' AND expires_at <= ${new Date()}
            AND id > ${cursor ?? ''}
          ORDER BY id
          LIMIT ${batchSize}
          FOR UPDATE SKIP LOCKED
        `;

        await this._expireInvitationBatch(tx, invitations);

        return invitations.length === batchSize
          ? invitations[invitations.length - 1].id
          : undefined;
      },
      { timeout: 15_000 },
    );
  }

  private async _resolveReceiverId(request: CreateInvitationRequest) {
    const { receiverId, receiverUsername, senderId } = request;
    if (!receiverId && !receiverUsername) {
      throw new RpcException({
        code: RpcStatus.INVALID_ARGUMENT,
        details: 'Не указан получатель приглашения',
      });
    }

    const { user } = await this.userClient.call(
      'getUser',
      receiverId ? { userId: receiverId } : { username: receiverUsername },
    );
    if (!user) {
      throw new RpcException({
        code: RpcStatus.NOT_FOUND,
        details: 'Пользователь не найден',
      });
    }
    if (user.id === senderId) {
      throw new RpcException({
        code: RpcStatus.INVALID_ARGUMENT,
        details: 'Нельзя пригласить самого себя',
      });
    }
    return user.id;
  }

  private async _assertReceiverNotMember(guildId: string, receiverId: string) {
    let member: GetMemberByIdResponse;
    try {
      member = await this.guildClient.call('getMemberById', {
        guildId,
        userId: receiverId,
      });
    } catch (error: unknown) {
      if (getRpcError(error)?.code === RpcStatus.NOT_FOUND) return;
      throw toRpcException(error, {
        code: RpcStatus.INTERNAL,
        details: 'Не удалось проверить участие пользователя в сервере',
      });
    }

    if (member.memberInfo) {
      throw new RpcException({
        code: RpcStatus.NOT_FOUND,
        details: 'Пользователь уже является участником сервера',
      });
    }
  }

  private async _getGuildForInvitation(request: CreateInvitationRequest) {
    const senderMember = await this.guildClient.call('getMemberById', {
      userId: request.senderId,
      guildId: request.guildId,
    });
    assertGuildPermission(
      senderMember.memberInfo,
      Permission.INVITE_MEMBERS,
      'У вас нет права приглашать участников на этот сервер',
    );

    const { guild } = await this.guildClient.call('getGuildById', {
      guildId: request.guildId,
    });
    if (!guild) {
      throw new RpcException({
        code: RpcStatus.NOT_FOUND,
        details: 'Такой сервер не существует',
      });
    }
    return guild;
  }

  private async _sendInvitationNotification(
    invitation: InvitationModel,
    guildName: string,
  ): Promise<Invitation> {
    const [payload] = await this._enrichInvitationsWithUsers([invitation]);
    const { notification } = await this.notificationClient.call(
      'sendNotification',
      {
        channel: `personal:#${invitation.receiverId}:notifications`,
        receiverId: invitation.receiverId,
        senderId: invitation.senderId,
        notificationType: NotificationType.NEW_INVITE_TO_GUILD,
        notificationPayload: JSON.stringify({
          message: `Пользователь ${payload.senderInfo?.username} приглашает вас вступить на сервер - ${guildName}`,
          payload,
        }),
      },
    );
    await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { notificationId: notification?.id },
    });
    return payload;
  }

  private _isExpired(invitation: InvitationModel): boolean {
    return (
      invitation.status === InvitationStatus.EXPIRED ||
      (invitation.status === InvitationStatus.PENDING &&
        invitation.expiresAt.getTime() <= Date.now())
    );
  }

  private _buildExpiredNotifications(invitations: readonly InvitationModel[]) {
    return invitations.flatMap((invitation) => {
      if (!invitation.notificationId) return [];

      return [
        {
          notificationId: invitation.notificationId,
          notificationPayload: JSON.stringify({
            message: EXPIRED_INVITATION_MESSAGE,
            payload: this._mapInvitation({
              ...invitation,
              status: InvitationStatus.EXPIRED,
            }),
          }),
        },
      ];
    });
  }

  private async _findInvitationForUpdate(
    tx: Prisma.TransactionClient,
    request: AcceptInvitationRequest,
  ) {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM invitations
      WHERE id = ${request.invitationId} AND receiver_id = ${request.userId}
      FOR UPDATE
    `;

    return tx.invitation.findUnique({
      where: { id: request.invitationId, receiverId: request.userId },
    });
  }

  private async _expireInvitation(
    tx: Prisma.TransactionClient,
    invitation: InvitationModel,
  ) {
    await this._expireInvitationBatch(tx, [invitation]);
  }

  private async _expireInvitationBatch(
    tx: Prisma.TransactionClient,
    invitations: readonly InvitationModel[],
  ) {
    if (invitations.length === 0) return;

    const notifications = this._buildExpiredNotifications(invitations);

    if (notifications.length > 0) {
      const { status } = await this.notificationClient.call(
        'expireInvitationNotifications',
        { notifications },
      );

      if (!status) {
        throw new RpcException({
          code: RpcStatus.UNAVAILABLE,
          details: 'Не удалось обновить уведомления истёкших приглашений',
        });
      }
    }

    // Коммитим статус только после подтверждения уведомлений и realtime-публикаций.
    await tx.invitation.updateMany({
      where: {
        id: { in: invitations.map(({ id }) => id) },
        status: InvitationStatus.PENDING,
        expiresAt: { lte: new Date() },
      },
      data: { status: InvitationStatus.EXPIRED },
    });
  }

  private async _updateInvitationNotification(invitation: InvitationModel) {
    if (!invitation.notificationId) return;

    const [payload] = await this._enrichInvitationsWithUsers([invitation]);
    const { guild } = await this.guildClient.call('getGuildById', {
      guildId: invitation.guildId,
    });
    const message =
      invitation.status === InvitationStatus.ACCEPTED
        ? `Вы приняли приглашение от пользователя ${payload.senderInfo?.username} на сервер - ${guild?.name}`
        : `Вы отклонили приглашение пользователя ${payload.senderInfo?.username} на сервер - ${guild?.name}`;

    await this.notificationClient.call('updateNotificationPayload', {
      notificationId: invitation.notificationId,
      notificationPayload: JSON.stringify({ message, payload }),
    });
  }

  private _mapInvitation(invitation: InvitationModel): Invitation {
    return {
      receiverInfo: undefined,
      senderInfo: undefined,
      id: invitation.id,
      guildId: invitation.guildId,
      senderId: invitation.senderId,
      receiverId: invitation.receiverId,
      invitedRole: invitation.invitedRole,
      status: GRPC_INVITATION_STATUS[invitation.status],
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
    };
  }

  private async _createPendingInvitation(
    data: Prisma.InvitationCreateInput,
  ): Promise<InvitationModel> {
    const maxAttempts = 3;

    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const existingInvitation = await tx.invitation.findFirst({
              where: {
                receiverId: data.receiverId,
                guildId: data.guildId,
                status: InvitationStatus.PENDING,
                expiresAt: { gt: new Date() },
              },
            });

            if (existingInvitation) {
              throw new RpcException({
                code: RpcStatus.ALREADY_EXISTS,
                details:
                  'Пользователю уже отправлено действующее приглашение на этот сервер',
              });
            }

            return tx.invitation.create({ data });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error: unknown) {
        // При параллельных запросах повторяем проверку на новом снимке БД.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < maxAttempts
        ) {
          continue;
        }

        throw error;
      }
    }
  }

  private async _enrichInvitationsWithUsers(
    invitations: readonly InvitationModel[],
  ): Promise<Invitation[]> {
    if (invitations.length === 0) return [];

    const userIds = new Set(
      invitations.flatMap(({ receiverId, senderId }) => [receiverId, senderId]),
    );
    const { users } = await this.userClient.call('getRangeUsersById', {
      usersId: [...userIds],
    });
    const usersById = new Map(users.map((user) => [user.id, user]));

    return invitations.map((invitation) => ({
      ...this._mapInvitation(invitation),
      receiverInfo: usersById.get(invitation.receiverId),
      senderInfo: usersById.get(invitation.senderId),
    }));
  }
}
