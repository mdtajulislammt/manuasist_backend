export function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getRabbitmqUrl(): string {
  return process.env.RABBITMQ_URL ?? 'amqp://guest:guest@127.0.0.1:5672';
}
