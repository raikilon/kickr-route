import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { RouteLocation } from '../route/route-point';
import { Route } from '../route/route';
import { TrainerService } from '../trainer/trainer.service';
import { TrainerTelemetry } from '../trainer/trainer-telemetry';
import { RideSession, RideStatus } from './ride-session';
import { RideSummary } from './ride-summary';

const TELEMETRY_FRESHNESS_MILLISECONDS = 2_000;

export type RideServiceStatus = 'idle' | 'starting' | RideStatus;

@Injectable({ providedIn: 'root' })
export class RideService {
  private readonly trainer = inject(TrainerService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly routeSignal = signal<Route | null>(null);
  private readonly statusSignal = signal<RideServiceStatus>('idle');
  private readonly elapsedSecondsSignal = signal(0);
  private readonly distanceMetersSignal = signal(0);
  private readonly summarySignal = signal<RideSummary | null>(null);
  private session: RideSession | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastUpdateTime = 0;

  readonly route = this.routeSignal.asReadonly();
  readonly status = this.statusSignal.asReadonly();
  readonly elapsedSeconds = this.elapsedSecondsSignal.asReadonly();
  readonly distanceMeters = this.distanceMetersSignal.asReadonly();
  readonly summary = this.summarySignal.asReadonly();
  readonly telemetry = this.trainer.telemetry;
  readonly canStart = computed(() => {
    const route = this.routeSignal();
    const connectionState = this.trainer.connectionState();
    if (!route || this.statusSignal() !== 'ready') {
      return false;
    }
    return connectionState === 'connected';
  });
  readonly canChangeRoute = computed(() => {
    const status = this.statusSignal();
    return status !== 'starting' && status !== 'riding' && status !== 'paused';
  });
  readonly completionPercentage = computed(() => {
    const route = this.routeSignal();
    if (!route) {
      return 0;
    }
    return route.completionPercentageAt(this.distanceMetersSignal());
  });
  readonly distanceRemainingMeters = computed(() => {
    const route = this.routeSignal();
    if (!route) {
      return 0;
    }
    return route.remainingDistanceAt(this.distanceMetersSignal());
  });
  readonly position = computed<RouteLocation | null>(() => {
    const route = this.routeSignal();
    if (!route) {
      return null;
    }
    return route.locationAt(this.distanceMetersSignal());
  });
  readonly currentGradientPercent = computed(() => {
    const position = this.position();
    if (!position) {
      return 0;
    }
    return position.gradientPercent;
  });
  constructor() {
    effect(() => this.handleTrainerConnectionChange(this.trainer.connectionState()));
    this.destroyRef.onDestroy(() => this.stopTimer());
  }

  setRoute(route: Route): boolean {
    if (!this.canChangeRoute()) {
      return false;
    }
    this.session = new RideSession(route);
    this.routeSignal.set(route);
    this.summarySignal.set(null);
    this.publishSession();
    return true;
  }

  clearRoute(): void {
    if (!this.canChangeRoute()) {
      return;
    }
    this.stopTimer();
    this.session = null;
    this.routeSignal.set(null);
    this.summarySignal.set(null);
    this.statusSignal.set('idle');
    this.elapsedSecondsSignal.set(0);
    this.distanceMetersSignal.set(0);
  }

  async start(): Promise<void> {
    const session = this.session;
    if (!session || !this.canStart()) {
      return;
    }
    this.statusSignal.set('starting');
    await this.trainer.startOrResume();
    if (!this.canCompleteStart(session)) {
      this.restoreSessionStatus();
      return;
    }
    session.start();
    this.summarySignal.set(null);
    this.beginTimer();
    this.publishSession();
    this.sendCurrentGradient();
  }

  async pause(): Promise<void> {
    if (!this.session || this.session.status !== 'riding') {
      return;
    }
    this.advanceSessionToNow();
    this.stopTimer();
    this.session.pause();
    this.publishSession();
    await this.trainer.pause();
  }

  async resume(): Promise<void> {
    if (!this.session || this.session.status !== 'paused') {
      return;
    }
    if (this.trainer.connectionState() !== 'connected') {
      return;
    }
    await this.trainer.startOrResume();
    this.session.resume();
    this.beginTimer();
    this.publishSession();
    this.sendCurrentGradient();
  }

  async finish(): Promise<void> {
    if (!this.session || !this.isActiveStatus(this.session.status)) {
      return;
    }
    if (this.session.status === 'riding') {
      this.advanceSessionToNow();
    }
    this.finishSession();
    await this.trainer.stop();
  }

  dismissSummary(): void {
    const route = this.routeSignal();
    if (!route || this.statusSignal() !== 'finished') {
      return;
    }
    this.session = new RideSession(route);
    this.summarySignal.set(null);
    this.publishSession();
  }

  private updateRide(): void {
    if (!this.session || this.session.status !== 'riding') {
      return;
    }
    this.advanceSessionToNow();
    this.sendCurrentGradient();
    if (!this.session.hasCompletedRoute()) {
      return;
    }
    this.finishSession();
    void this.trainer.stop();
  }

  private advanceSessionToNow(): void {
    if (!this.session || this.session.status !== 'riding') {
      return;
    }
    const currentTime = performance.now();
    const elapsedSeconds = Math.max(0, (currentTime - this.lastUpdateTime) / 1_000);
    this.lastUpdateTime = currentTime;
    this.session.advance(this.freshTelemetry(currentTime), elapsedSeconds);
    this.publishSession();
  }

  private finishSession(): void {
    if (!this.session) {
      return;
    }
    this.stopTimer();
    this.summarySignal.set(this.session.finish());
    this.publishSession();
  }

  private publishSession(): void {
    if (!this.session) {
      return;
    }
    this.statusSignal.set(this.session.status);
    this.elapsedSecondsSignal.set(this.session.elapsedSeconds);
    this.distanceMetersSignal.set(this.session.completedDistanceMeters);
  }

  private beginTimer(): void {
    this.stopTimer();
    this.lastUpdateTime = performance.now();
    this.timer = setInterval(() => this.updateRide(), 250);
  }

  private stopTimer(): void {
    if (this.timer === null) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
  }

  private sendCurrentGradient(): void {
    this.trainer.setGradient(this.currentGradientPercent());
  }

  private handleTrainerConnectionChange(connectionState: string): void {
    if (connectionState === 'connected' || !this.session) {
      return;
    }
    if (this.statusSignal() === 'starting') {
      this.restoreSessionStatus();
      return;
    }
    if (this.session.status !== 'riding') {
      return;
    }
    this.advanceSessionToNow();
    this.stopTimer();
    this.session.pause();
    this.publishSession();
  }

  private isActiveStatus(status: RideStatus): boolean {
    return status === 'riding' || status === 'paused';
  }

  private canCompleteStart(session: RideSession): boolean {
    return this.session === session && this.trainer.connectionState() === 'connected';
  }

  private restoreSessionStatus(): void {
    if (!this.session) {
      this.statusSignal.set('idle');
      return;
    }
    this.statusSignal.set(this.session.status);
  }

  private freshTelemetry(currentTime: number): TrainerTelemetry | null {
    const telemetry = this.trainer.telemetry();
    if (!telemetry) {
      return null;
    }
    if (currentTime - telemetry.timestamp > TELEMETRY_FRESHNESS_MILLISECONDS) {
      return null;
    }
    return telemetry;
  }
}
