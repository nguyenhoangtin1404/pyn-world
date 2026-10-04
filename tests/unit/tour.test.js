import { describe, it, expect } from 'vitest'
import { readingTime, sentences } from '../../src/app/tour.js'

describe('tour', () => {
  it('đủ thời gian đọc phụ đề, ít nhất 5 s', () => {
    expect(readingTime('ngắn')).toBe(5)
    expect(readingTime('x'.repeat(140))).toBe(10)
  })

  it('tách câu để đọc từng câu', () => {
    expect(sentences('Chào bạn. Tháp cao 35 mét! Ngoài khơi là dòng chữ: ABC.')).toEqual(['Chào bạn.', 'Tháp cao 35 mét!', 'Ngoài khơi là dòng chữ:', 'ABC.'])
  })
})
