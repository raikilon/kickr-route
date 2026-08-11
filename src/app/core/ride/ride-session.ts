import { RouteLocation } from '../route/route-point';
import { Route } from '../route/route';
import { TrainerTelemetry } from '../trainer/trainer-telemetry';
import { RideDistance } from './ride-distance';
import { RideStatistics } from './ride-statistics';
import { RideSummary } from './ride-summary';
import { RideSummaryBuilder } from './ride-summary-builder';

export type RideStatus = 'ready' | 'riding' | 'paused' | 'finished';

export class RideSession {
  private distance: RideDistance;
  private statistics = new RideStatistics();
  private readonly summaryBuilder: RideSummaryBuilder;
  private elapsedRideSeconds = 0;
  private rideStatus: RideStatus = 'ready';

  constructor(readonly route: Route) {
    this.distance = new RideDistance(route.totalDistanceMeters);
    this.summaryBuilder = new RideSummaryBuilder(route);
  }

  get status(): RideStatus {
    return this.rideStatus;
  }

  get elapsedSeconds(): number {
    return this.elapsedRideSeconds;
  }

  get completedDistanceMeters(): number {
    return this.distance.completedMeters;
  }

  get completionPercentage(): number {
    return this.route.completionPercentageAt(this.completedDistanceMeters);
  }

  get remainingDistanceMeters(): number {
    return this.route.remainingDistanceAt(this.completedDistanceMeters);
  }

  get location(): RouteLocation {
    return this.route.locationAt(this.completedDistanceMeters);
  }

  get currentGradientPercent(): number {
    return this.location.gradientPercent;
  }

  start(): void {
    this.distance = new RideDistance(this.route.totalDistanceMeters);
    this.statistics = new RideStatistics();
    this.elapsedRideSeconds = 0;
    this.rideStatus = 'riding';
  }

  pause(): void {
    if (this.rideStatus !== 'riding') {
      return;
    }
    this.rideStatus = 'paused';
  }

  resume(): void {
    if (this.rideStatus !== 'paused') {
      return;
    }
    this.rideStatus = 'riding';
  }

  advance(telemetry: TrainerTelemetry | null, elapsedSeconds: number): void {
    if (this.rideStatus !== 'riding' || elapsedSeconds <= 0) {
      return;
    }
    this.elapsedRideSeconds += elapsedSeconds;
    this.statistics.record(telemetry, elapsedSeconds);
    this.distance.advance(telemetry?.speedKph, elapsedSeconds);
  }

  hasCompletedRoute(): boolean {
    return this.completedDistanceMeters >= this.route.totalDistanceMeters;
  }

  finish(): RideSummary {
    this.rideStatus = 'finished';
    return this.summaryBuilder.build(
      this.statistics,
      this.elapsedRideSeconds,
      this.completedDistanceMeters,
    );
  }
}
