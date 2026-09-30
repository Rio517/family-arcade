/**
 * Gulp Universe's sounds, made in code with Web Audio: a gulp that deepens with
 * what was swallowed, a level-up chime, a power-up sparkle, a boom, a warning
 * horn and the countdown beeps. No sound files, so the PWA stays offline.
 *
 * The audio context starts on the first tap (browsers require a gesture), and
 * everything is silent when muted or when Web Audio is missing.
 */

export type Cue = 'gulp' | 'level' | 'power' | 'boom' | 'warn' | 'tick' | 'go' | 'hurt' | 'win';

type Ctx = AudioContext;

export class Sounds {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private last = new Map<Cue, number>();
  muted = false;

  /** Call from a tap or click: browsers only let audio start from one. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  /** `size` 0..1: how big the thing was (a cone or a tower). */
  play(cue: Cue, size = 0): void {
    const ctx = this.ctx;
    const out = this.master;
    if (!ctx || !out || this.muted || ctx.state !== 'running') return;
    // Many things swallowed at once make one sound, not a machine gun.
    const now = ctx.currentTime;
    const gap = cue === 'gulp' ? 0.06 : 0.15;
    if (now - (this.last.get(cue) ?? -1) < gap) return;
    this.last.set(cue, now);
    switch (cue) {
      case 'gulp':
        this.sweep(520 - size * 380, 160 - size * 110, 0.12 + size * 0.2, 'sine', 0.35 + size * 0.3);
        break;
      case 'level':
        [523, 659, 784, 1047].forEach((f, i) => this.note(f, now + i * 0.09, 0.18, 'triangle', 0.25));
        break;
      case 'power':
        [880, 1175, 1568].forEach((f, i) => this.note(f, now + i * 0.06, 0.14, 'sine', 0.2));
        break;
      case 'win':
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.note(f, now + i * 0.12, 0.22, 'triangle', 0.25));
        break;
      case 'tick':
        this.note(660, now, 0.12, 'square', 0.12);
        break;
      case 'go':
        this.note(990, now, 0.3, 'square', 0.14);
        break;
      case 'warn':
        this.note(440, now, 0.18, 'sawtooth', 0.1);
        this.note(330, now + 0.22, 0.25, 'sawtooth', 0.1);
        break;
      case 'hurt':
        this.sweep(300, 90, 0.4, 'square', 0.15);
        break;
      case 'boom':
        this.noise(0.6, 0.5);
        this.sweep(120, 40, 0.5, 'sine', 0.5);
        break;
    }
  }

  private note(freq: number, at: number, dur: number, type: OscillatorType, vol: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(vol, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain).connect(this.master!);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private sweep(from: number, to: number, dur: number, type: OscillatorType, vol: number): void {
    const ctx = this.ctx!;
    const at = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), at + dur);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(vol, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain).connect(this.master!);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private noise(dur: number, vol: number): void {
    const ctx = this.ctx!;
    const at = ctx.currentTime;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    // A fixed pattern is fine for noise and keeps randomness out of the app.
    let seed = 12345;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = ((seed / 0x7fffffff) * 2 - 1) * (1 - i / data.length);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(at);
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}
