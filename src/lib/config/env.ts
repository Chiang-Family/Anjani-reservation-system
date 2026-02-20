import { z } from 'zod';

const envSchema = z.object({
  LINE_CHANNEL_SECRET: z.string().min(1),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1),
  NOTION_API_KEY: z.string().min(1),
  NOTION_STUDENTS_DB_ID: z.string().min(1),
  NOTION_COACHES_DB_ID: z.string().min(1),
  NOTION_CHECKIN_DB_ID: z.string().min(1),
  NOTION_PAYMENTS_DB_ID: z.string().min(1),
  GOOGLE_CALENDAR_ID: z.string().min(1),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().min(1),
  GOOGLE_PRIVATE_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(1).optional(),
  RICH_MENU_STUDENT_ID: z.string().optional(),
  RICH_MENU_COACH_ID: z.string().optional(),
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
