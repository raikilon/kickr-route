import { Subject } from 'rxjs';
import { TrainerEnvironment } from '../trainer-environment';
import { TrainerGrade } from '../trainer-grade';
import { FtmsControlPoint } from './ftms-control-point';

const UPDATE_INTERVAL_MS = 1_000;

class TrainerSimulationRequest {
  readonly grade: TrainerGrade;

  constructor(
    gradientPercent: number,
    readonly environment: TrainerEnvironment,
  ) {
    this.grade = new TrainerGrade(gradientPercent);
  }

  differsMeaningfullyFrom(other: TrainerSimulationRequest | null): boolean {
    if (!other) {
      return true;
    }
    return (
      this.grade.differsMeaningfullyFrom(other.grade) ||
      this.environment.differsFrom(other.environment)
    );
  }
}

export class TrainerSimulationController {
  private readonly errorSubject = new Subject<Error>();
  private lastSentRequest: TrainerSimulationRequest | null = null;
  private pendingRequest: TrainerSimulationRequest | null = null;
  private lastSentTime = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly errors$ = this.errorSubject.asObservable();

  constructor(private readonly controlPoint: FtmsControlPoint) {}

  request(gradientPercent: number, environment: TrainerEnvironment): void {
    const request = new TrainerSimulationRequest(gradientPercent, environment);
    if (!request.differsMeaningfullyFrom(this.lastSentRequest)) {
      this.pendingRequest = null;
      this.clearTimer();
      return;
    }
    this.pendingRequest = request;
    this.scheduleFlush();
  }

  async neutralize(): Promise<void> {
    this.clearTimer();
    this.pendingRequest = null;
    try {
      await this.controlPoint.setSimulationParameters(
        TrainerGrade.neutral,
        TrainerEnvironment.default,
      );
      this.lastSentRequest = new TrainerSimulationRequest(0, TrainerEnvironment.default);
    } catch {
      // Neutralization is best effort during pause and shutdown.
    }
  }

  dispose(): void {
    this.clearTimer();
    this.pendingRequest = null;
    this.errorSubject.complete();
  }

  private scheduleFlush(): void {
    const elapsedMilliseconds = performance.now() - this.lastSentTime;
    const delayMilliseconds = Math.max(0, UPDATE_INTERVAL_MS - elapsedMilliseconds);
    this.clearTimer();
    this.timer = setTimeout(() => void this.flush(), delayMilliseconds);
  }

  private async flush(): Promise<void> {
    const request = this.pendingRequest;
    this.pendingRequest = null;
    if (!request) {
      return;
    }
    try {
      await this.controlPoint.setSimulationParameters(request.grade, request.environment);
      this.lastSentRequest = request;
      this.lastSentTime = performance.now();
    } catch (error) {
      this.errorSubject.next(this.asError(error));
    }
  }

  private clearTimer(): void {
    if (this.timer === null) {
      return;
    }
    clearTimeout(this.timer);
    this.timer = null;
  }

  private asError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }
    return new Error(String(error));
  }
}
