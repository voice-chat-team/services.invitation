export const GRPC_INVITATION_STATUS = {
  PENDING: 0,
  ACCEPTED: 1,
  DECLINED: 2,
  EXPIRED: 3,
} as const;

export type GrpcInvitationStatus =
  (typeof GRPC_INVITATION_STATUS)[keyof typeof GRPC_INVITATION_STATUS];

export const INVITATION_STATUS_TO_GRPC: Record<string, GrpcInvitationStatus> = {
  PENDING: 0,
  ACCEPTED: 1,
  DECLINED: 2,
  EXPIRED: 3,
};

export const GRPC_TO_INVITATION_STATUS: Record<number, string> = {
  0: 'PENDING',
  1: 'ACCEPTED',
  2: 'DECLINED',
  3: 'EXPIRED',
};
