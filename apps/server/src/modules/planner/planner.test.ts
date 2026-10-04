import { describe, it, expect } from 'vitest';
import { PRIORITY_WEIGHTS, type ItemPriority } from '@assistant/shared';

describe('Planner & Dependency Analysis — Phase 2', () => {
  describe('Focus Scoring Algorithm', () => {
    function computeFocusScore(
      priority: ItemPriority,
      dueAt: Date | null,
      status: string,
      now: Date = new Date(),
    ): number {
      let score = 0;
      score += (PRIORITY_WEIGHTS[priority] ?? 1) * 10;

      if (dueAt) {
        const hoursUntilDue = (dueAt.getTime() - now.getTime()) / (1000 * 60 * 60);
        if (hoursUntilDue < 0) {
          score += 50; // Overdue
        } else if (hoursUntilDue < 24) {
          score += 30; // Due today
        } else if (hoursUntilDue < 72) {
          score += 15; // Due within 3 days
        }
      }

      if (status === 'blocked') {
        score -= 100;
      }

      return score;
    }

    it('ranks overdue high-priority tasks higher than regular tasks', () => {
      const now = new Date('2026-10-04T12:00:00Z');
      const overdueTask = new Date('2026-10-03T12:00:00Z');
      const dueNextWeek = new Date('2026-10-12T12:00:00Z');

      const overdueScore = computeFocusScore('high', overdueTask, 'in_progress', now);
      const regularScore = computeFocusScore('high', dueNextWeek, 'in_progress', now);

      expect(overdueScore).toBeGreaterThan(regularScore);
      expect(overdueScore - regularScore).toBe(50);
    });

    it('penalizes blocked tasks so they are not recommended as immediate focus', () => {
      const now = new Date('2026-10-04T12:00:00Z');
      const dueToday = new Date('2026-10-04T18:00:00Z');

      const activeTaskScore = computeFocusScore('critical', dueToday, 'todo', now);
      const blockedTaskScore = computeFocusScore('critical', dueToday, 'blocked', now);

      expect(blockedTaskScore).toBeLessThan(0);
      expect(activeTaskScore - blockedTaskScore).toBe(100);
    });
  });
});
