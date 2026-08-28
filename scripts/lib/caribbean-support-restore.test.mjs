import { describe, expect, it, vi } from 'vitest';

import { continueAfterSupportRestore } from './caribbean-support-restore.mjs';

function fakePage(snapshot) {
  const resume = {
    click: vi.fn(async () => {}),
    isEnabled: vi.fn(async () => true),
    isVisible: vi.fn(async () => true),
  };
  const expected = { waitFor: vi.fn(async () => {}) };
  return {
    expected,
    resume,
    page: {
      getByTestId: vi.fn((testId) => testId === 'encounter-avoid' ? expected : resume),
      waitForFunction: vi.fn(async () => ({ jsonValue: async () => snapshot })),
    },
  };
}

describe('support-restored Caribbean browser continuation', () => {
  it('accepts the expected encounter when auto-resume wins without attempting the old unconditional click', async () => {
    const fixture = fakePage({ kind: 'expected-route' });

    await continueAfterSupportRestore(fixture.page, { expectedTestId: 'encounter-avoid' });

    expect(fixture.resume.click).not.toHaveBeenCalled();
    expect(fixture.page.getByTestId).not.toHaveBeenCalled();
  });

  it('uses a real locator click only when the Resume career control wins enabled', async () => {
    const fixture = fakePage({ kind: 'enabled-resume' });

    await continueAfterSupportRestore(fixture.page, { expectedTestId: 'encounter-avoid' });

    expect(fixture.resume.isVisible).toHaveBeenCalledOnce();
    expect(fixture.resume.isEnabled).toHaveBeenCalledOnce();
    expect(fixture.resume.click).toHaveBeenCalledOnce();
    expect(fixture.expected.waitFor).toHaveBeenCalledOnce();
  });

  it.each([
    [{ kind: 'setup' }, 'support-restore-setup'],
    [{ kind: 'recovery' }, 'support-restore-recovery'],
    [{ kind: 'wrong-route', testId: 'caribbean-career-ready' }, 'support-restore-wrong-route-caribbean-career-ready'],
  ])('fails closed for %j', async (snapshot, message) => {
    const fixture = fakePage(snapshot);

    await expect(continueAfterSupportRestore(fixture.page, {
      expectedTestId: 'encounter-avoid',
    })).rejects.toThrow(message);
    expect(fixture.resume.click).not.toHaveBeenCalled();
  });

  it('propagates a browser-oracle timeout without clicking', async () => {
    const fixture = fakePage({ kind: 'expected-route' });
    fixture.page.waitForFunction.mockRejectedValueOnce(new Error('support-restore-timeout'));

    await expect(continueAfterSupportRestore(fixture.page, {
      expectedTestId: 'encounter-avoid',
    })).rejects.toThrow('support-restore-timeout');
    expect(fixture.resume.click).not.toHaveBeenCalled();
  });

  it('fails closed if the Resume career control changes after the oracle resolves', async () => {
    const fixture = fakePage({ kind: 'enabled-resume' });
    fixture.resume.isEnabled.mockResolvedValueOnce(false);

    await expect(continueAfterSupportRestore(fixture.page, {
      expectedTestId: 'encounter-avoid',
    })).rejects.toThrow('support-restore-resume-not-actionable');
    expect(fixture.resume.click).not.toHaveBeenCalled();
  });
});
