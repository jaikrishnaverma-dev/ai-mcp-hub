import { describe, it, expect } from 'vitest';
import { RRule } from 'rrule';

describe('Calendar Pure Logic — Phase 2', () => {
  describe('RRULE Recurrence Expansion', () => {
    it('correctly expands weekly recurring events within a date range', () => {
      const dtstart = new Date('2026-10-05T10:00:00Z'); // Monday
      const rule = new RRule({
        freq: RRule.WEEKLY,
        byweekday: [RRule.MO],
        dtstart,
      });

      const rangeStart = new Date('2026-10-01T00:00:00Z');
      const rangeEnd = new Date('2026-10-31T23:59:59Z');

      const occurrences = rule.between(rangeStart, rangeEnd, true);
      // October 2026 Mondays: Oct 5, Oct 12, Oct 19, Oct 26 (4 Mondays)
      expect(occurrences.length).toBe(4);
      expect(occurrences[0]!.toISOString()).toBe('2026-10-05T10:00:00.000Z');
      expect(occurrences[1]!.toISOString()).toBe('2026-10-12T10:00:00.000Z');
      expect(occurrences[2]!.toISOString()).toBe('2026-10-19T10:00:00.000Z');
      expect(occurrences[3]!.toISOString()).toBe('2026-10-26T10:00:00.000Z');
    });

    it('correctly parses iCal RRULE strings', () => {
      const rule = RRule.fromString('FREQ=DAILY;INTERVAL=2;COUNT=5');
      const start = new Date('2026-10-01T09:00:00Z');
      const ruleWithStart = new RRule({
        ...rule.origOptions,
        dtstart: start,
      });

      const all = ruleWithStart.all();
      expect(all.length).toBe(5);
      expect(all[0]!.toISOString()).toBe('2026-10-01T09:00:00.000Z');
      expect(all[1]!.toISOString()).toBe('2026-10-03T09:00:00.000Z');
      expect(all[2]!.toISOString()).toBe('2026-10-05T09:00:00.000Z');
    });
  });

  describe('Conflict Detection Overlap Logic', () => {
    function computeOverlap(
      aStart: string,
      aEnd: string,
      bStart: string,
      bEnd: string,
    ): { overlaps: boolean; overlapMinutes: number } {
      const as = new Date(aStart).getTime();
      const ae = new Date(aEnd).getTime();
      const bs = new Date(bStart).getTime();
      const be = new Date(bEnd).getTime();

      const overlaps = as < be && ae > bs;
      if (!overlaps) return { overlaps: false, overlapMinutes: 0 };

      const overlapStart = Math.max(as, bs);
      const overlapEnd = Math.min(ae, be);
      const overlapMinutes = Math.round((overlapEnd - overlapStart) / (1000 * 60));
      return { overlaps: true, overlapMinutes };
    }

    it('detects partial overlap between two events', () => {
      // 10:00 to 11:30 and 11:00 to 12:00 -> 30 min overlap
      const res = computeOverlap(
        '2026-10-04T10:00:00Z',
        '2026-10-04T11:30:00Z',
        '2026-10-04T11:00:00Z',
        '2026-10-04T12:00:00Z',
      );
      expect(res.overlaps).toBe(true);
      expect(res.overlapMinutes).toBe(30);
    });

    it('detects complete containment overlap', () => {
      // 09:00 to 17:00 and 14:00 to 15:00 -> 60 min overlap
      const res = computeOverlap(
        '2026-10-04T09:00:00Z',
        '2026-10-04T17:00:00Z',
        '2026-10-04T14:00:00Z',
        '2026-10-04T15:00:00Z',
      );
      expect(res.overlaps).toBe(true);
      expect(res.overlapMinutes).toBe(60);
    });

    it('returns false for adjacent/back-to-back non-overlapping events', () => {
      // 10:00 to 11:00 and 11:00 to 12:00 -> 0 min overlap
      const res = computeOverlap(
        '2026-10-04T10:00:00Z',
        '2026-10-04T11:00:00Z',
        '2026-10-04T11:00:00Z',
        '2026-10-04T12:00:00Z',
      );
      expect(res.overlaps).toBe(false);
      expect(res.overlapMinutes).toBe(0);
    });

    it('returns false for completely separated events', () => {
      const res = computeOverlap(
        '2026-10-04T09:00:00Z',
        '2026-10-04T10:00:00Z',
        '2026-10-04T14:00:00Z',
        '2026-10-04T15:00:00Z',
      );
      expect(res.overlaps).toBe(false);
      expect(res.overlapMinutes).toBe(0);
    });
  });

  describe('Free Slots Calculation Algorithm', () => {
    function findGaps(
      dayStartIso: string,
      dayEndIso: string,
      events: Array<{ start: string; end: string }>,
      minDurationMinutes: number,
    ) {
      const dayStart = new Date(dayStartIso).getTime();
      const dayEnd = new Date(dayEndIso).getTime();

      const sorted = events
        .map(e => ({ start: new Date(e.start).getTime(), end: new Date(e.end).getTime() }))
        .sort((a, b) => a.start - b.start);

      const slots: Array<{ start: string; end: string; durationMinutes: number }> = [];
      let cursor = dayStart;

      for (const event of sorted) {
        if (event.start > cursor) {
          const gapMinutes = Math.round((event.start - cursor) / (60 * 1000));
          if (gapMinutes >= minDurationMinutes) {
            slots.push({
              start: new Date(cursor).toISOString(),
              end: new Date(event.start).toISOString(),
              durationMinutes: gapMinutes,
            });
          }
        }
        cursor = Math.max(cursor, event.end);
      }

      if (cursor < dayEnd) {
        const gapMinutes = Math.round((dayEnd - cursor) / (60 * 1000));
        if (gapMinutes >= minDurationMinutes) {
          slots.push({
            start: new Date(cursor).toISOString(),
            end: new Date(dayEnd).toISOString(),
            durationMinutes: gapMinutes,
          });
        }
      }

      return slots;
    }

    it('finds entire day as free slot when no events exist', () => {
      const slots = findGaps(
        '2026-10-04T09:00:00Z',
        '2026-10-04T17:00:00Z',
        [],
        30,
      );
      expect(slots.length).toBe(1);
      expect(slots[0]!.durationMinutes).toBe(8 * 60); // 480 min
    });

    it('finds morning and afternoon free slots around a lunch meeting', () => {
      const slots = findGaps(
        '2026-10-04T09:00:00Z',
        '2026-10-04T17:00:00Z',
        [{ start: '2026-10-04T12:00:00Z', end: '2026-10-04T13:00:00Z' }],
        30,
      );
      expect(slots.length).toBe(2);
      expect(slots[0]!.durationMinutes).toBe(180); // 9am - 12pm (3 hrs)
      expect(slots[1]!.durationMinutes).toBe(240); // 1pm - 5pm (4 hrs)
    });

    it('filters out gaps smaller than requested duration', () => {
      const slots = findGaps(
        '2026-10-04T09:00:00Z',
        '2026-10-04T11:00:00Z',
        [{ start: '2026-10-04T09:20:00Z', end: '2026-10-04T10:00:00Z' }],
        30, // requires at least 30 min
      );
      // 09:00 to 09:20 is only 20 min -> filtered out
      // 10:00 to 11:00 is 60 min -> retained
      expect(slots.length).toBe(1);
      expect(slots[0]!.durationMinutes).toBe(60);
    });
  });
});
