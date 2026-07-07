-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "receiver_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invited_role" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);
