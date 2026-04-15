import { ClientProxy, ClientProxyFactory, Transport } from '@nestjs/microservices';
import { createRmqPublisherOptions } from './rmq-transport.options';
import { RMQ_EVENT_CLIENT } from './tokens';

export function createRmqEventClientProvider(queueSuffix: string) {
  return {
    provide: RMQ_EVENT_CLIENT,
    useFactory: (): ClientProxy =>
      ClientProxyFactory.create({
        transport: Transport.RMQ,
        options: createRmqPublisherOptions(queueSuffix),
      }),
  };
}
