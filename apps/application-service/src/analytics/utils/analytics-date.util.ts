export type AnalyticsRange = 'today' | 'week' | 'month';

export const GOOD_WEEK_NAI_THRESHOLD = 80;

export function utcDayStart(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function utcDayEnd(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + 1,
    ),
  );
}

export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function lastNDays(count: number, now = new Date()): Date[] {
  const today = utcDayStart(now);
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(today);
    day.setUTCDate(today.getUTCDate() - (count - 1 - index));
    return day;
  });
}

export type WeekBucket = {
  label: string;
  weekStart: Date;
  weekEnd: Date;
  isCurrentWeek: boolean;
};

export function lastNWeeks(count: number, now = new Date()): WeekBucket[] {
  const today = utcDayStart(now);
  const dayOfWeek = today.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const currentWeekStart = new Date(today);
  currentWeekStart.setUTCDate(today.getUTCDate() + mondayOffset);

  return Array.from({ length: count }, (_, index) => {
    const weekStart = new Date(currentWeekStart);
    weekStart.setUTCDate(currentWeekStart.getUTCDate() - (count - 1 - index) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 7);
    return {
      label: `W${index + 1}`,
      weekStart,
      weekEnd,
      isCurrentWeek: index === count - 1,
    };
  });
}

export type DateBucket = {
  label: string;
  date: string;
  start: Date;
  end: Date;
};

export function buildRangeBuckets(
  range: AnalyticsRange,
  now = new Date(),
): DateBucket[] {
  if (range === 'today') {
    const start = utcDayStart(now);
    return [
      {
        label: 'Today',
        date: formatIsoDate(start),
        start,
        end: utcDayEnd(now),
      },
    ];
  }

  if (range === 'week') {
    return lastNDays(7, now).map((day) => ({
      label: day.toLocaleDateString('en-US', {
        weekday: 'short',
        timeZone: 'UTC',
      }),
      date: formatIsoDate(day),
      start: day,
      end: utcDayEnd(day),
    }));
  }

  const rangeStart = utcDayStart(now);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - 34);
  return Array.from({ length: 6 }, (_, index) => {
    const start = new Date(rangeStart);
    start.setUTCDate(rangeStart.getUTCDate() + index * 7);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 7);
    return {
      label: `W${index + 1}`,
      date: formatIsoDate(start),
      start,
      end: index === 5 ? utcDayEnd(now) : end,
    };
  });
}

export function resolveRangeWindow(range: AnalyticsRange, now = new Date()) {
  const to = utcDayEnd(now);
  if (range === 'today') {
    return { from: utcDayStart(now), to };
  }
  if (range === 'week') {
    const from = utcDayStart(now);
    from.setUTCDate(from.getUTCDate() - 6);
    return { from, to };
  }
  const from = utcDayStart(now);
  from.setUTCDate(from.getUTCDate() - 34);
  return { from, to };
}

export function scanVisitBuckets(
  range: AnalyticsRange,
  now = new Date(),
): DateBucket[] {
  if (range === 'today') {
    const dayStart = utcDayStart(now);
    return Array.from({ length: 6 }, (_, index) => {
      const start = new Date(dayStart);
      start.setUTCHours(index * 4, 0, 0, 0);
      const end = new Date(start);
      end.setUTCHours(start.getUTCHours() + 4);
      return {
        label: start.toLocaleTimeString('en-US', {
          hour: 'numeric',
          timeZone: 'UTC',
        }),
        date: start.toISOString(),
        start,
        end: index === 5 ? utcDayEnd(now) : end,
      };
    });
  }

  return buildRangeBuckets(range, now);
}

export function formatHourLabel(hour: number): string {
  if (hour === 0) {
    return '12am';
  }
  if (hour === 12) {
    return '12pm';
  }
  if (hour < 12) {
    return `${hour}am`;
  }
  return `${hour - 12}pm`;
}

/** Cumulative macro checkpoints for today's line chart (6am → 10pm). */
export function todayMacroTimeBuckets(now = new Date()): DateBucket[] {
  const dayStart = utcDayStart(now);
  const hours = [6, 10, 14, 18, 22];
  return hours.map((hour) => {
    const end = new Date(dayStart);
    end.setUTCHours(hour, 0, 0, 0);
    return {
      label: formatHourLabel(hour),
      date: end.toISOString(),
      start: dayStart,
      end,
    };
  });
}
