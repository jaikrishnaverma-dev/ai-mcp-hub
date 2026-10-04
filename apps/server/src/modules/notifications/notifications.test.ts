import { describe, it, expect } from 'vitest';
import {
  setReminderInput,
  cancelReminderInput,
  registerPushSubscriptionInput,
  cronProcessInput,
  updateNotificationPrefsInput,
} from '@assistant/shared';

describe('Notification & Push System Logic — Phase 2', () => {
  describe('Zod Validation Schemas', () => {
    it('validates valid reminder inputs with relative offset', () => {
      const parsed = setReminderInput.safeParse({
        itemId: '507f1f77bcf86cd799439011',
        trigger: 'before_due',
        offsetMinutes: 30,
        channels: ['web_push', 'telegram'],
        reason: 'Reminder for review meeting',
      });
      expect(parsed.success).toBe(true);
    });

    it('validates exact datetime reminder triggers', () => {
      const parsed = setReminderInput.safeParse({
        itemId: '507f1f77bcf86cd799439011',
        trigger: 'at_time',
        triggerAt: '2026-10-05T14:30:00.000Z',
        channels: ['web_push'],
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects invalid push subscription payloads', () => {
      const parsed = registerPushSubscriptionInput.safeParse({
        endpoint: 'not-a-valid-url',
        keys: { p256dh: 'abc' }, // missing auth
      });
      expect(parsed.success).toBe(false);
    });

    it('accepts valid Web Push API subscription data', () => {
      const parsed = registerPushSubscriptionInput.safeParse({
        endpoint: 'https://fcm.googleapis.com/fcm/send/sample-token',
        keys: {
          p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9ic04YpqxHIOZ3MyT6psXVgVWIsRiCtAHU=',
          auth: 'tBHItJI5svbpez7KI4CCXg==',
        },
        userAgent: 'Mozilla/5.0 Chrome/120.0.0.0 Mobile Safari/537.36',
      });
      expect(parsed.success).toBe(true);
    });

    it('validates quiet hours formatting in preferences (HH:mm)', () => {
      const valid = updateNotificationPrefsInput.safeParse({
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
      });
      expect(valid.success).toBe(true);

      const invalid = updateNotificationPrefsInput.safeParse({
        quietHoursStart: '10pm',
      });
      expect(invalid.success).toBe(false);
    });

    it('validates cron batch processing input defaults', () => {
      const parsed = cronProcessInput.parse({});
      expect(parsed.batchSize).toBe(50);
      expect(parsed.dryRun).toBe(false);
    });
  });

  describe('Quiet Hours Evaluation Logic', () => {
    function isInQuietHours(
      currentHhMm: string,
      startHhMm: string,
      endHhMm: string,
    ): boolean {
      const [curH, curM] = currentHhMm.split(':').map(Number);
      const [startH, startM] = startHhMm.split(':').map(Number);
      const [endH, endM] = endHhMm.split(':').map(Number);

      const curMin = curH! * 60 + curM!;
      const startMin = startH! * 60 + startM!;
      const endMin = endH! * 60 + endM!;

      if (startMin <= endMin) {
        // Same-day quiet hours (e.g. 13:00 to 14:00)
        return curMin >= startMin && curMin < endMin;
      } else {
        // Overnight quiet hours (e.g. 22:00 to 07:00)
        return curMin >= startMin || curMin < endMin;
      }
    }

    it('correctly flags midnight within overnight quiet hours (22:00 to 07:00)', () => {
      expect(isInQuietHours('00:30', '22:00', '07:00')).toBe(true);
      expect(isInQuietHours('23:15', '22:00', '07:00')).toBe(true);
      expect(isInQuietHours('06:45', '22:00', '07:00')).toBe(true);
      expect(isInQuietHours('08:00', '22:00', '07:00')).toBe(false);
      expect(isInQuietHours('15:00', '22:00', '07:00')).toBe(false);
    });

    it('correctly handles same-day quiet hours (e.g., afternoon focus time 14:00 to 16:00)', () => {
      expect(isInQuietHours('14:30', '14:00', '16:00')).toBe(true);
      expect(isInQuietHours('16:05', '14:00', '16:00')).toBe(false);
      expect(isInQuietHours('10:00', '14:00', '16:00')).toBe(false);
    });
  });
});
