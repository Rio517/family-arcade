const RESUME_TEST_ID = 'caribbean-resume-career-button';
const START_TEST_ID = 'caribbean-start-career-button';

export async function continueAfterSupportRestore(page, {
  expectedTestId,
  wrongTestIds = ['caribbean-career-ready', 'voyage-continue-east', 'naval-battle-page'],
  timeout = 30_000,
}) {
  const stateHandle = await page.waitForFunction(({
    expectedTestId: expected,
    resumeTestId,
    startTestId,
    wrongTestIds: wrong,
  }) => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 0
        && rect.height > 0;
    };
    const byTestId = (testId) => document.querySelector(`[data-testid="${testId}"]`);

    if (visible(byTestId(expected))) return { kind: 'expected-route' };

    const resume = byTestId(resumeTestId);
    if (visible(resume) && resume instanceof HTMLButtonElement && !resume.disabled) {
      return { kind: 'enabled-resume' };
    }
    if (visible(document.querySelector('.caribbean-recovery-panel'))) return { kind: 'recovery' };
    if (visible(byTestId(startTestId))) return { kind: 'setup' };
    for (const testId of wrong) {
      if (visible(byTestId(testId))) return { kind: 'wrong-route', testId };
    }
    return false;
  }, {
    expectedTestId,
    resumeTestId: RESUME_TEST_ID,
    startTestId: START_TEST_ID,
    wrongTestIds,
  }, { timeout });
  const state = await stateHandle.jsonValue();

  if (state.kind === 'expected-route') return;
  if (state.kind === 'recovery') throw new Error('support-restore-recovery');
  if (state.kind === 'setup') throw new Error('support-restore-setup');
  if (state.kind === 'wrong-route') throw new Error(`support-restore-wrong-route-${state.testId}`);
  if (state.kind !== 'enabled-resume') throw new Error('support-restore-unknown-state');

  const resume = page.getByTestId(RESUME_TEST_ID);
  if (!await resume.isVisible() || !await resume.isEnabled()) {
    throw new Error('support-restore-resume-not-actionable');
  }
  try {
    await resume.click();
  } catch (error) {
    if (await page.getByTestId(expectedTestId).isVisible()) return;
    throw error;
  }
  await page.getByTestId(expectedTestId).waitFor();
}
