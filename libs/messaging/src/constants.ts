export const RMQ_EVENTS_EXCHANGE = 'menu_assist.events';

export const RMQ_AI_INGESTION_QUEUE = 'menu_assist.ai_ingestion.events';

export function rmqPublisherQueueName(suffix: string): string {
  return `menu_assist.publisher.${suffix}`;
}
