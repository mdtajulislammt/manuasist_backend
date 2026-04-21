import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { RMQ_EVENT_CLIENT } from '@messaging/tokens';

@Injectable()
export class RmqConnectService implements OnModuleInit {
  constructor(
    @Inject(RMQ_EVENT_CLIENT) private readonly client: ClientProxy,
  ) {}

  async onModuleInit() {
    await this.client.connect();
  }
}
