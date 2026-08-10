import { Injectable } from '@angular/core';
import { interval, Subject, Subscription } from 'rxjs';
import { TrainerEnvironment } from '../trainer-environment';
import { TrainerGrade } from '../trainer-grade';
import { TrainerTelemetry } from '../trainer-telemetry';
import { Trainer, TrainerConnection } from '../trainer';

@Injectable({ providedIn: 'root' })
export class DemoTrainer implements Trainer {
  private readonly telemetrySubject = new Subject<TrainerTelemetry>();
  private readonly disconnectedSubject = new Subject<void>();
  private readonly errorSubject = new Subject<Error>();
  private timer: Subscription | null = null;
  private elapsedSeconds = 0;
  private grade = TrainerGrade.neutral;
  private lastUpdateTime = 0;

  readonly telemetry$ = this.telemetrySubject.asObservable();
  readonly disconnected$ = this.disconnectedSubject.asObservable();
  readonly errors$ = this.errorSubject.asObservable();

  connect(): Promise<TrainerConnection> {
    this.resetSimulation();
    this.emitStoppedTelemetry();
    return Promise.resolve({
      deviceName: 'Demo trainer',
      controlState: 'ready',
      gradeControlSupported: true,
      controlError: null,
    });
  }

  startOrResume(): Promise<void> {
    if (this.timer) {
      return Promise.resolve();
    }
    this.lastUpdateTime = performance.now();
    this.timer = interval(500).subscribe(() => this.updateSimulation());
    return Promise.resolve();
  }

  pause(): Promise<void> {
    this.stopTimer();
    this.emitStoppedTelemetry();
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.stopTimer();
    this.grade = TrainerGrade.neutral;
    this.emitStoppedTelemetry();
    return Promise.resolve();
  }

  setEnvironment(environment: TrainerEnvironment): void {
    void environment;
  }

  setGradient(gradientPercent: number): void {
    this.grade = new TrainerGrade(gradientPercent);
  }

  async disconnect(): Promise<void> {
    await this.stop();
    this.resetSimulation();
  }

  private updateSimulation(): void {
    const currentTime = performance.now();
    const elapsedSeconds = Math.max(0, (currentTime - this.lastUpdateTime) / 1_000);
    this.lastUpdateTime = currentTime;
    this.elapsedSeconds += Math.min(2, elapsedSeconds);
    const wave = Math.sin(this.elapsedSeconds / 4);
    const speedKph = this.clamp(30 - this.grade.percent * 1.15 + wave * 1.8, 8, 48);
    const cadenceRpm = this.clamp(88 - this.grade.percent * 0.35 + wave * 3, 62, 102);
    const powerWatts = this.clamp(165 + Math.max(0, this.grade.percent) * 16 + wave * 18, 90, 430);
    this.emitTelemetry(speedKph, cadenceRpm, powerWatts);
  }

  private emitTelemetry(speedKph: number, cadenceRpm: number, powerWatts: number): void {
    this.telemetrySubject.next({
      timestamp: performance.now(),
      speedKph,
      cadenceRpm,
      powerWatts,
    });
  }

  private emitStoppedTelemetry(): void {
    this.telemetrySubject.next({
      timestamp: performance.now(),
      speedKph: 0,
      cadenceRpm: 0,
      powerWatts: 0,
    });
  }

  private resetSimulation(): void {
    this.stopTimer();
    this.elapsedSeconds = 0;
    this.grade = TrainerGrade.neutral;
  }

  private stopTimer(): void {
    this.timer?.unsubscribe();
    this.timer = null;
  }

  private clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
  }
}
