import { describe, it, expect } from 'vitest'
import { vietnamHour } from '../../src/world/sky.js'

describe('vietnamHour', () => {
  it('is UTC + 7 as a fraction of the day, whatever the local time zone', () => {
    expect(vietnamHour(new Date('2026-10-04T02:30:00Z'))).toBeCloseTo(9.5)
    expect(vietnamHour(new Date('2026-10-04T16:59:00Z'))).toBeCloseTo(23 + 59 / 60)
    expect(vietnamHour(new Date('2026-10-04T17:00:00Z'))).toBeCloseTo(0) // midnight in Vietnam
    expect(vietnamHour(new Date('2026-10-04T23:15:00Z'))).toBeCloseTo(6.25)
  })
})
