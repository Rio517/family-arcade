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
});
