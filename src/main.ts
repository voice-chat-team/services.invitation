import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { PROTO_PATHS } from '@voice-chat/contracts';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'invitation.v1',
      protoPath: PROTO_PATHS.INVITATION,
      url: '0.0.0.0:5055',
    },
  });

  app.enableShutdownHooks();
  await app.init();
  await app.startAllMicroservices();
}
void bootstrap();
