import type { RmqOptions } from '@nestjs/microservices';
import { getRabbitmqUrl } from '@contracts/env';
import {
  RMQ_AI_INGESTION_QUEUE,
  RMQ_EVENTS_EXCHANGE,
  rmqPublisherQueueName,
} from './constants';

function baseUrls(): string[] {
  return [getRabbitmqUrl()];
}

export function createRmqPublisherOptions(queueSuffix: string): RmqOptions {
  return {
    urls: baseUrls(),
    queue: rmqPublisherQueueName(queueSuffix),
    exchange: RMQ_EVENTS_EXCHANGE,
    exchangeType: 'topic',
    persistent: true,
    queueOptions: { durable: false },
  };
}

export function createRmqMicroserviceOptions(): RmqOptions {
  return {
    urls: baseUrls(),
    queue: RMQ_AI_INGESTION_QUEUE,
    exchange: RMQ_EVENTS_EXCHANGE,
    exchangeType: 'topic',
    queueOptions: { durable: true },
    prefetchCount: 10,
    noAck: false,
  };
}
