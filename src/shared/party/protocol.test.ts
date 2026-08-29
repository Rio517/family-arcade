import { describe, expect, it } from 'vitest';
import { isPartyMsg } from './protocol';

describe('isPartyMsg', () => {
  it('accepts a hello with a name', () => {
    expect(isPartyMsg({ t: 'hello', name: 'Kai' })).toBe(true);
  });

  it('rejects malformed or foreign data', () => {
    expect(isPartyMsg(null)).toBe(false);
    expect(isPartyMsg({ t: 'hello' })).toBe(false);
    expect(isPartyMsg({ t: 'hello', name: 5 })).toBe(false);
    expect(isPartyMsg({ t: 'nope', name: 'Kai' })).toBe(false);
    expect(isPartyMsg('hello')).toBe(false);
  });

  it('rejects an absurdly long name but accepts a normal one', () => {
    expect(isPartyMsg({ t: 'hello', name: 'x'.repeat(100) })).toBe(true);
    expect(isPartyMsg({ t: 'hello', name: 'x'.repeat(101) })).toBe(false);
  });

  describe('the table', () => {
    it('accepts a table with a game id and a real four-character code', () => {
      expect(isPartyMsg({ t: 'table', game: 'chess', code: 'AB23' })).toBe(true);
      expect(isPartyMsg({ t: 'table', game: 'chess', code: 'AB23', hostSide: 'b' })).toBe(true);
    });

    it('rejects a code that is not exactly what the broker id would carry', () => {
      expect(isPartyMsg({ t: 'table', game: 'chess', code: 'ab23' })).toBe(false); // not normalized
      expect(isPartyMsg({ t: 'table', game: 'chess', code: 'AB2' })).toBe(false); // short
      expect(isPartyMsg({ t: 'table', game: 'chess', code: 'AB01' })).toBe(false); // look-alikes
      expect(isPartyMsg({ t: 'table', game: 'chess', code: 'AB23X' })).toBe(false);
    });

    it('bounds the game id and the side', () => {
      expect(isPartyMsg({ t: 'table', game: '', code: 'AB23' })).toBe(false);
      expect(isPartyMsg({ t: 'table', game: 'x'.repeat(33), code: 'AB23' })).toBe(false);
      expect(isPartyMsg({ t: 'table', game: 'chess', code: 'AB23', hostSide: 'x'.repeat(9) })).toBe(false);
      expect(isPartyMsg({ t: 'table', game: 7, code: 'AB23' })).toBe(false);
    });
  });

  it('accepts a knock on a game and a closed table', () => {
    expect(isPartyMsg({ t: 'knock', game: 'racer' })).toBe(true);
    expect(isPartyMsg({ t: 'knock', game: '' })).toBe(false);
    expect(isPartyMsg({ t: 'knock' })).toBe(false);
    expect(isPartyMsg({ t: 'table-closed' })).toBe(true);
  });
});
