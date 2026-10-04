/**
 * Telegram channel — sends notifications via Telegram Bot API.
 *
 * Requires:
 * - TELEGRAM_BOT_TOKEN in environment
 * - User must have linked their Telegram via the bot /start command
 *   (which stores their chatId in NotificationPreference.telegramChatId)
 *
 * Uses raw fetch (no library dependency) to call Telegram's sendMessage API.
 */
import { createModuleLogger } from '../../../config/index.js';

const log = createModuleLogger('telegram');

const TELEGRAM_BOT_TOKEN = process.env['TELEGRAM_BOT_TOKEN'] || '';
const TELEGRAM_API_BASE = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// --- Types ---

export interface TelegramPayload {
  title: string;
  body: string;
  url?: string;
  itemId?: string;
}

// --- Send ---

export async function sendTelegram(
  chatId: string,
  payload: TelegramPayload,
): Promise<{ success: boolean; error?: string }> {
  if (!TELEGRAM_BOT_TOKEN) {
    return { success: false, error: 'TELEGRAM_BOT_TOKEN not configured' };
  }

  if (!chatId) {
    return { success: false, error: 'No Telegram chat ID for this user' };
  }

  // Format message with Markdown
  const lines: string[] = [
    `🔔 *${escapeMarkdown(payload.title)}*`,
    '',
    escapeMarkdown(payload.body),
  ];

  if (payload.url) {
    lines.push('', `[View in Portal](${payload.url})`);
  }

  const text = lines.join('\n');

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
      }),
    });

    const result = await response.json() as { ok: boolean; description?: string };

    if (!result.ok) {
      log.error({ chatId, error: result.description }, 'Telegram send failed');
      return { success: false, error: result.description || 'Telegram API error' };
    }

    log.info({ chatId }, 'Telegram message sent');
    return { success: true };
  } catch (err) {
    log.error({ err, chatId }, 'Telegram send error');
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Escape special characters for Telegram MarkdownV2.
 */
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

export function isTelegramConfigured(): boolean {
  return Boolean(TELEGRAM_BOT_TOKEN);
}

/**
 * Set up webhook for the Telegram bot (call once during setup).
 * The webhook URL should point to: POST /api/telegram/webhook
 */
export async function setTelegramWebhook(webhookUrl: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) return false;

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl }),
    });
    const result = await response.json() as { ok: boolean; description?: string };
    log.info({ ok: result.ok, description: result.description }, 'Telegram webhook set');
    return result.ok;
  } catch (err) {
    log.error({ err }, 'Failed to set Telegram webhook');
    return false;
  }
}
