import { describe, expect, it } from 'vitest';
import { hash, sealText, tamper } from '../../src/world/seal.js';

describe('the sealed sea sign', () => {
  it('unscrambles to its words, and they match the checksum', () => {
    expect(sealText()).toBe('HOÀNG SA, TRƯỜNG SA LÀ CỦA VIỆT NAM');
    expect(hash(sealText())).toBe(hash('HOÀNG SA, TRƯỜNG SA LÀ CỦA VIỆT NAM'));
    expect(hash('HOÀNG SA, TRƯỜNG SA LÀ CỦA VIỆT NAN')).not.toBe(hash(sealText()));
  });
  it('tampering stops the app with an error', () => {
    expect(() => tamper('X')).toThrow(/bị chỉnh sửa/);
  });
});
