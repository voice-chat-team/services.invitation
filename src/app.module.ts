import { Module } from '@nestjs/common';
import { InvitationModule } from './modules/invitation/invitation.module';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from './modules/user/user.module';
import { GuildModule } from './modules/guild/guild.module';
import { CentrifugoModule } from './infrastructure/centrifugo/centrifugo.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV}.local`, '.env'],
    }),
    PrismaModule,
    InvitationModule,
    UserModule,
    GuildModule,
    CentrifugoModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
