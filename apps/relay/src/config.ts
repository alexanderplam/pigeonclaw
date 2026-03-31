import { z } from 'zod';

const relayEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().min(1),
  RELAY_BOOTSTRAP_TOKEN: z.string().min(24),
  RELAY_ENCRYPTION_KEY: z.string().min(24),
  PUBLIC_BASE_URL: z.string().url().optional(),
});

export type RelayConfig = z.infer<typeof relayEnvSchema>;

export function loadRelayConfig(env: NodeJS.ProcessEnv): RelayConfig {
  return relayEnvSchema.parse(env);
}
