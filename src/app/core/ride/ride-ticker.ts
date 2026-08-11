export interface RideTick {
  readonly currentTime: number;
  readonly elapsedSeconds: number;
}

export class RideTicker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastUpdateTime = 0;

  constructor(private readonly onTick: (currentTime: number, elapsedSeconds: number) => void) {}

  start(): void {
    this.stop();
    this.lastUpdateTime = performance.now();
    this.timer = setInterval(() => this.publishTick(), 250);
  }

  stop(): void {
    if (this.timer === null) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
  }

  flush(): RideTick | null {
    if (this.timer === null) {
      return null;
    }
    const currentTime = performance.now();
    const elapsedSeconds = Math.max(0, (currentTime - this.lastUpdateTime) / 1_000);
    this.lastUpdateTime = currentTime;
    return { currentTime, elapsedSeconds };
  }

  private publishTick(): void {
    const tick = this.flush();
    if (!tick) {
      return;
    }
    this.onTick(tick.currentTime, tick.elapsedSeconds);
  }
}
