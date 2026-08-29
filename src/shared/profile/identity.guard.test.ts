import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

/**
 * "No game writes a name" is enforced at the import boundary (eslint.config.js).
 * This proves the rule is actually wired: lint a would-be offender under a
 * src/games path and expect the restriction to fire — for the writer hook and
 * for the raw store beneath it — while the same import is fine in shared code.
 */
const OFFENDERS = [
  "import { useIdentity } from '@shared/profile/useIdentity';",
  "import { setUsersState } from '@shared/profile/usersStore';",
  "import { updateActiveProfile } from '@shared/profile/users';",
  "import { useIdentity } from '../../../shared/profile/useIdentity';",
];

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(`${code}\nexport const x = 1;\n`, { filePath });
  return result.messages.map((m) => m.ruleId ?? '');
}

describe('the identity import guard', () => {
  it('blocks every identity writer inside a game', async () => {
    for (const line of OFFENDERS) {
      expect(await ruleIds(line, 'src/games/chess/components/Offender.tsx'), line).toContain(
        'no-restricted-imports',
      );
    }
  }, 30000);

  it('lets a game read the ticket, and lets shared code use the writers', async () => {
    const reads = await ruleIds(
      "import { useProfile } from '@shared/profile/useProfile';",
      'src/games/chess/components/Reader.tsx',
    );
    expect(reads).not.toContain('no-restricted-imports');
    const shared = await ruleIds(OFFENDERS[0], 'src/shared/party/Fine.tsx');
    expect(shared).not.toContain('no-restricted-imports');
    // Tests inside a game may seed the roster.
    const test = await ruleIds(OFFENDERS[1], 'src/games/chess/components/Seed.test.tsx');
    expect(test).not.toContain('no-restricted-imports');
  }, 30000);
});
