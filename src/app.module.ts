import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { InvitationModule } from './modules/invitation/invitation.module';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from './modules/user/user.module';
import { GuildModule } from './modules/guild/guild.module';
import { NotificationModule } from './modules/notification/notification.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV}.local`, '.env'],
    }),
    PrismaModule,
    NotificationModule,
    InvitationModule,
    UserModule,
    GuildModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
