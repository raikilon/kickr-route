export class RideDistance {
  constructor(
    private readonly routeDistanceMeters: number,
    private currentDistanceMeters = 0,
  ) {}

  get completedMeters(): number {
    return this.currentDistanceMeters;
  }

  advance(speedKph: number | undefined, elapsedSeconds: number): void {
    if (!this.isValidSpeed(speedKph) || elapsedSeconds <= 0) {
      return;
    }
    const distanceDeltaMeters = (speedKph / 3.6) * elapsedSeconds;
    this.currentDistanceMeters = this.clampToRoute(
      this.currentDistanceMeters + distanceDeltaMeters,
    );
  }

  private clampToRoute(distanceMeters: number): number {
    return Math.min(this.routeDistanceMeters, Math.max(0, distanceMeters));
  }

  private isValidSpeed(speedKph: number | undefined): speedKph is number {
    return speedKph !== undefined && Number.isFinite(speedKph) && speedKph >= 0;
  }
}
