export interface FrameRunnerOptions {
  tickRate: number;
  maxTicksPerFrame: number;
}

const MICROS_PER_SECOND = 1_000_000;

function positiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
}

export class FrameRunner {
  readonly tickRate: number;
  readonly maxTicksPerFrame: number;

  #remainderNumerator = 0;
  #backlogTicks = 0;

  constructor(options: FrameRunnerOptions) {
    positiveSafeInteger(options.tickRate, 'tickRate');
    positiveSafeInteger(options.maxTicksPerFrame, 'maxTicksPerFrame');
    this.tickRate = options.tickRate;
    this.maxTicksPerFrame = options.maxTicksPerFrame;
  }

  get backlogTicks(): number {
    return this.#backlogTicks;
  }

  /** Remainder in microseconds multiplied by tickRate, always below 1,000,000. */
  get remainderNumerator(): number {
    return this.#remainderNumerator;
  }

  get remainderMicros(): number {
    return this.#remainderNumerator / this.tickRate;
  }

  deliverMicros(micros: number): number {
    if (!Number.isSafeInteger(micros) || micros < 0) {
      throw new RangeError('delivered microseconds must be a non-negative safe integer');
    }

    const deliveredNumerator = micros * this.tickRate;
    if (!Number.isSafeInteger(deliveredNumerator)) {
      throw new RangeError('delivered microseconds exceed the safe rational range');
    }
    const totalNumerator = this.#remainderNumerator + deliveredNumerator;
    if (!Number.isSafeInteger(totalNumerator)) {
      throw new RangeError('delivered microseconds exceed the safe rational range');
    }

    const newTicks = Math.floor(totalNumerator / MICROS_PER_SECOND);
    this.#remainderNumerator = totalNumerator % MICROS_PER_SECOND;
    if (!Number.isSafeInteger(this.#backlogTicks + newTicks)) {
      throw new RangeError('frame backlog exceeds the safe integer range');
    }
    this.#backlogTicks += newTicks;

    const work = Math.min(this.#backlogTicks, this.maxTicksPerFrame);
    this.#backlogTicks -= work;
    return work;
  }

  reset(): void {
    this.#remainderNumerator = 0;
    this.#backlogTicks = 0;
  }
}
