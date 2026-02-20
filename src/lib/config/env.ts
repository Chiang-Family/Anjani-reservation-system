import { z } from 'zod';

const envSchema = z.object({
  LINE_CHANNEL_SECRET: z.string().min(1),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1),
  NOTION_API_KEY: z.string().min(1),
  NOTION_STUDENTS_DB_ID: z.string().min(1),
  NOTION_COACHES_DB_ID: z.string().min(1),
  NOTION_CLASS_SLOTS_DB_ID: z.string().min(1),
  NOTION_RESERVATIONS_DB_ID: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (_env) return _env;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Missing environment variables: ${missing}`);
  }

  _env = result.data;
  return _env;
}
