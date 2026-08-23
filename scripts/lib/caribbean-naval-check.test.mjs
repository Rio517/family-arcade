import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import * as navalCheck from '../caribbean-naval-check.mjs';

function activeSamples() {
  return Array.from({ length: 20 }, (_, index) => ({
    tick: (index + 1) * 60,
    paused: false,
    outcome: null,
    fps: 60,
    textures: 3,
    geometries: 30,
    materials: 30,
    bufferAttributes: 88,
    activeEffects: index % 4 === 0 ? 5 : 0,
    effectCapacity: 96,
  }));
}

describe('naval browser evidence helpers', () => {
  it('locks the playable and warning-only viewport matrix', () => {
    expect(navalCheck.VIEWPORTS).toEqual({
      tablet: { width: 1180, height: 820 },
      desktop: { width: 1440, height: 900 },
      minimum: { width: 1024, height: 768 },
      boundary: { width: 960, height: 600 },
      phonePortrait: { width: 430, height: 932 },
      phoneLandscape: { width: 844, height: 390 },
    });
  });

  it('treats varying active effects as pooled activity and checks every sample capacity', () => {
    const valid = navalCheck.plateauEvidence(activeSamples());
    expect(valid.growthAfterWarmup).toEqual({
      textures: 0,
      geometries: 0,
      materials: 0,
      bufferAttributes: 0,
      activeEffects: 5,
      effectCapacity: 0,
    });
    expect(valid.poolErrors).toEqual([]);

    const invalid = activeSamples();
    invalid[13].activeEffects = 97;
    expect(navalCheck.plateauEvidence(invalid).poolErrors).toEqual([
      'sample 13 active=97 capacity=96',
    ]);
  });

  it('fails closed when the GPU buffer-attribute resource class is missing or grows', () => {
    const missing = activeSamples();
    delete missing[4].bufferAttributes;
    expect(navalCheck.plateauEvidence(missing).allocationErrors).toContain('sample 4 bufferAttributes=undefined');

    const growing = activeSamples();
    growing[19].bufferAttributes += 1;
    expect(navalCheck.plateauEvidence(growing).growthAfterWarmup.bufferAttributes).toBe(1);
  });

  it('records neutral runtime HEAD provenance instead of a historical pre-Task-8 role', () => {
    const expectedHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const expectedDirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim().length > 0;
    const provenance = navalCheck.captureSourceProvenance({
      root: process.cwd(),
      sourceFiles: ['package.json'],
    });

    expect(provenance).toMatchObject({
      headCommitAtCapture: expectedHead,
      worktreeDirtyBeforeCapture: expectedDirty,
      sourceTreeFiles: ['package.json'],
    });
    expect(provenance.sourceTreeSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(provenance).not.toHaveProperty('baseCommit');
    expect(provenance).not.toHaveProperty('baseCommitRole');
  });

  it('closes a listening server when the post-listen health check rejects', async () => {
    let closeCalls = 0;
    class TestServer extends EventEmitter {
      listening = false;
      listen(_port, _host, callback) {
        this.listening = true;
        queueMicrotask(callback);
      }
      address() {
        return { address: '127.0.0.1', family: 'IPv4', port: 32123 };
      }
      close(callback) {
        this.listening = false;
        closeCalls += 1;
        queueMicrotask(() => callback());
      }
    }
    const server = new TestServer();

    await expect(navalCheck.startStaticServer({
      createServer: () => server,
      healthCheck: async () => { throw new Error('synthetic health failure'); },
    })).rejects.toThrow('synthetic health failure');
    expect(server.listening).toBe(false);
    expect(closeCalls).toBe(1);
  });
});
