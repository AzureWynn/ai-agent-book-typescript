export type NotifyChannel = 'email' | 'telegram' | 'slack' | 'discord';

export interface PreflightResult {
  channel: NotifyChannel;
  sent: boolean;
  blocked: boolean;
  reason: string;
}

const CRED_ENV: Record<NotifyChannel, string[]> = {
  email: ['SMTP_HOST', 'SMTP_USERNAME'],
  telegram: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_DEFAULT_CHAT_ID'],
  slack: ['SLACK_WEBHOOK_URL'],
  discord: ['DISCORD_WEBHOOK_URL'],
};

function redact(value: string): string {
  return value ? '[set]' : '[missing]';
}

export function preflight(channel: NotifyChannel, message: string): PreflightResult {
  const missing = CRED_ENV[channel].filter((k) => !process.env[k]);
  if (missing.length > 0) {
    return {
      channel,
      sent: false,
      blocked: true,
      reason: `missing credentials: ${missing.join(', ')} (preflight only, nothing sent) — message was: ${message.slice(0, 80)}`,
    };
  }
  const shown = CRED_ENV[channel].map((k) => `${k}=${redact(process.env[k] ?? '')}`).join(', ');
  return {
    channel,
    sent: false,
    blocked: true,
    reason: `credentials present (${shown}) but real delivery requires explicit confirmSend; teaching preflight stops here`,
  };
}
