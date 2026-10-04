/**
 * Email channel — sends notifications via SMTP (nodemailer).
 *
 * Requires in environment:
 * - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 * - SMTP_FROM (sender email address)
 *
 * Falls back to disabled if SMTP is not configured.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { createModuleLogger } from '../../../config/index.js';

const log = createModuleLogger('email');

// --- Config ---

const SMTP_HOST = process.env['SMTP_HOST'] || '';
const SMTP_PORT = parseInt(process.env['SMTP_PORT'] || '587', 10);
const SMTP_USER = process.env['SMTP_USER'] || '';
const SMTP_PASS = process.env['SMTP_PASS'] || '';
const SMTP_FROM = process.env['SMTP_FROM'] || 'Assistant <noreply@mcphub.apptiva.in>';

let transporter: Transporter | null = null;

if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
  log.info({ host: SMTP_HOST, port: SMTP_PORT }, 'Email SMTP configured');
} else {
  log.warn('SMTP not configured — email notifications will be disabled');
}

// --- Types ---

export interface EmailPayload {
  title: string;
  body: string;
  url?: string;
  itemId?: string;
}

// --- Send ---

export async function sendEmail(
  toAddress: string,
  payload: EmailPayload,
): Promise<{ success: boolean; error?: string }> {
  if (!transporter) {
    return { success: false, error: 'SMTP not configured' };
  }

  if (!toAddress) {
    return { success: false, error: 'No email address for this user' };
  }

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 12px 12px 0 0;">
        <h2 style="color: white; margin: 0; font-size: 18px;">🔔 ${escapeHtml(payload.title)}</h2>
      </div>
      <div style="background: #ffffff; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="color: #374151; line-height: 1.6; margin: 0 0 16px;">${escapeHtml(payload.body)}</p>
        ${payload.url ? `<a href="${payload.url}" style="display: inline-block; background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 8px; font-weight: 500;">View in Portal</a>` : ''}
      </div>
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">
        Sent by Assistant — mcphub.apptiva.in
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to: toAddress,
      subject: `🔔 ${payload.title}`,
      html: htmlBody,
      text: `${payload.title}\n\n${payload.body}${payload.url ? `\n\nView: ${payload.url}` : ''}`,
    });

    log.info({ to: toAddress }, 'Email sent');
    return { success: true };
  } catch (err) {
    log.error({ err, to: toAddress }, 'Email send failed');
    return { success: false, error: (err as Error).message };
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function isEmailConfigured(): boolean {
  return transporter !== null;
}
