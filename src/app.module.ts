import { Module } from '@nestjs/common';
import { InvitationModule } from './modules/invitation/invitation.module';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV}.local`, '.env'],
    }),
    PrismaModule,
    InvitationModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
