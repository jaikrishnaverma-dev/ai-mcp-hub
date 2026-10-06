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

  describe('Agent Core Algorithms — Phase 3', () => {
    function computeUrgencyScore(
      priority: ItemPriority,
      dueAt: Date | null,
      status: string,
      now: Date = new Date(),
    ): number {
      let score = 0;
      score += (PRIORITY_WEIGHTS[priority] ?? 1) * 10;
      if (dueAt) {
        const hoursUntilDue = (dueAt.getTime() - now.getTime()) / (1000 * 60 * 60);
        if (hoursUntilDue < 0) score += 50;
        else if (hoursUntilDue < 24) score += 30;
        else if (hoursUntilDue < 72) score += 15;
        else if (hoursUntilDue < 168) score += 5;
      }
      if (status === 'blocked') score -= 100;
      return score;
    }

    it('ranks unblocked critical task due within 24 hours above all other active tasks', () => {
      const now = new Date('2026-10-06T12:00:00Z');
      const dueIn6Hours = new Date('2026-10-06T18:00:00Z');
      const dueNextWeek = new Date('2026-10-15T12:00:00Z');

      const urgentScore = computeUrgencyScore('critical', dueIn6Hours, 'in_progress', now);
      const futureCritical = computeUrgencyScore('critical', dueNextWeek, 'in_progress', now);
      const regularMedium = computeUrgencyScore('medium', dueIn6Hours, 'in_progress', now);

      expect(urgentScore).toBeGreaterThan(futureCritical);
      expect(urgentScore).toBeGreaterThan(regularMedium);
    });

    it('evaluates verify assertions accurately against task statuses', () => {
      function evaluateStatusClaim(expectedStatus: string, actualStatus: string) {
        return {
          verified: expectedStatus === actualStatus,
          confidence: 'high' as const,
          reason: expectedStatus === actualStatus
            ? `Task status is '${actualStatus}' as expected`
            : `Task status is '${actualStatus}', expected '${expectedStatus}'`,
        };
      }

      const match = evaluateStatusClaim('done', 'done');
      expect(match.verified).toBe(true);
      expect(match.reason).toContain("status is 'done'");

      const mismatch = evaluateStatusClaim('done', 'in_progress');
      expect(mismatch.verified).toBe(false);
      expect(mismatch.reason).toContain("expected 'done'");
    });

    it('identifies bottleneck task with highest dependent count', () => {
      const tasks = [
        { id: 't1', title: 'Task A', unlocksCount: 1, isBottleneck: false },
        { id: 't2', title: 'Task B (Venue)', unlocksCount: 4, isBottleneck: true },
        { id: 't3', title: 'Task C', unlocksCount: 2, isBottleneck: false },
      ];

      const bottleneck = tasks.reduce((prev, curr) => (curr.unlocksCount > prev.unlocksCount ? curr : prev));
      expect(bottleneck.id).toBe('t2');
      expect(bottleneck.isBottleneck).toBe(true);
    });
  });

});
