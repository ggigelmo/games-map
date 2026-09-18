import { describe, expect, it } from 'vitest';

import { currentMonth, nextSearchState, type SearchLimitRecord } from './search-limit';

const JAN = new Date(2026, 0, 15);
const FEB = new Date(2026, 1, 1);

describe('currentMonth', () => {
  it('formats as YYYY-MM', () => {
    expect(currentMonth(JAN)).toBe('2026-01');
    expect(currentMonth(FEB)).toBe('2026-02');
  });
});

describe('nextSearchState', () => {
  it('allows the first-ever search and starts the count at 1', () => {
    const { record, allowed } = nextSearchState(null, JAN, 3);
    expect(allowed).toBe(true);
    expect(record).toEqual({ month: '2026-01', count: 1 });
  });

  it('keeps incrementing and allowing while under the limit', () => {
    let record: SearchLimitRecord | null = null;
    for (let i = 0; i < 2; i++) {
      const step = nextSearchState(record, JAN, 3);
      expect(step.allowed).toBe(true);
      record = step.record;
    }
    expect(record).toEqual({ month: '2026-01', count: 2 });
  });

  it('stops allowing once the limit is hit, and does not increment further', () => {
    let record: SearchLimitRecord = { month: '2026-01', count: 3 };
    const first = nextSearchState(record, JAN, 3);
    expect(first.allowed).toBe(false);
    expect(first.record).toEqual({ month: '2026-01', count: 3 });

    record = first.record;
    const second = nextSearchState(record, JAN, 3);
    expect(second.allowed).toBe(false);
    expect(second.record.count).toBe(3);
  });

  it('resets the count on a new month regardless of the old count', () => {
    const record: SearchLimitRecord = { month: '2026-01', count: 3 };
    const { record: next, allowed } = nextSearchState(record, FEB, 3);
    expect(allowed).toBe(true);
    expect(next).toEqual({ month: '2026-02', count: 1 });
  });
});
