import { NextRequest, NextResponse } from 'next/server';
import { validateSignature } from '@/lib/line/validate';
import { handleEvent } from '@/handlers';
import type { WebhookEvent } from '@line/bot-sdk';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get('x-line-signature');

    if (!signature || !validateSignature(body, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const parsed = JSON.parse(body) as { events: WebhookEvent[] };
    const events = parsed.events ?? [];

    await Promise.allSettled(events.map((event) => handleEvent(event)));

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', message: 'Anjani webhook is running' });
}
