import { describe, expect, it } from 'vite-plus/test';

import {
  endsWithLineBreak,
  findFirstNonInlineWhitespaceIndex,
  findLastNonEmptyLine,
} from '../string';

describe('string utils', () => {
  describe('findLastNonEmptyLine', () => {
    it('returns the final line range', () => {
      expect(findLastNonEmptyLine('alpha\nbeta')).toEqual({ start: 6, end: 10 });
    });

    it('skips trailing empty lines', () => {
      expect(findLastNonEmptyLine('alpha\nbeta\n\n')).toEqual({ start: 6, end: 10 });
    });

    it('handles CRLF line endings', () => {
      expect(findLastNonEmptyLine('alpha\r\nbeta\r\n')).toEqual({ start: 7, end: 11 });
    });

    it('returns null for empty text and empty lines', () => {
      expect(findLastNonEmptyLine('')).toBeNull();
      expect(findLastNonEmptyLine('\n\n')).toBeNull();
    });
  });

  describe('endsWithLineBreak', () => {
    it('returns true for existing line endings', () => {
      expect(endsWithLineBreak('alpha\n')).toBe(true);
      expect(endsWithLineBreak('alpha\r')).toBe(true);
    });

    it('returns false for empty text and text without a line ending', () => {
      expect(endsWithLineBreak('')).toBe(false);
      expect(endsWithLineBreak('alpha')).toBe(false);
    });
  });

  describe('findFirstNonInlineWhitespaceIndex', () => {
    it('finds the first non-space and non-tab index', () => {
      expect(findFirstNonInlineWhitespaceIndex(' \t alpha', 0)).toBe(3);
    });

    it('stops at line endings and respects the end boundary', () => {
      expect(findFirstNonInlineWhitespaceIndex('  \nalpha', 0)).toBe(2);
      expect(findFirstNonInlineWhitespaceIndex('   alpha', 0, 2)).toBe(2);
    });
  });
});
