export class ElevationViewport {
  readonly startMeters: number;
  readonly endMeters: number;
  readonly isFullRoute: boolean;

  constructor(
    routeDistanceMeters: number,
    riderDistanceMeters: number,
    zoomMeters: number | null,
    readonly width = 1_000,
  ) {
    const requestedSpanMeters = this.requestedSpan(routeDistanceMeters, zoomMeters);
    this.isFullRoute = requestedSpanMeters >= routeDistanceMeters;
    const maximumStartMeters = Math.max(0, routeDistanceMeters - requestedSpanMeters);
    const desiredStartMeters = riderDistanceMeters - requestedSpanMeters * 0.25;
    this.startMeters = Math.min(maximumStartMeters, Math.max(0, desiredStartMeters));
    this.endMeters = Math.min(routeDistanceMeters, this.startMeters + requestedSpanMeters);
  }

  xForDistance(distanceMeters: number): number {
    const clampedDistance = Math.min(this.endMeters, Math.max(this.startMeters, distanceMeters));
    const viewportSpan = Math.max(1, this.endMeters - this.startMeters);
    return ((clampedDistance - this.startMeters) / viewportSpan) * this.width;
  }

  private requestedSpan(routeDistanceMeters: number, zoomMeters: number | null): number {
    if (zoomMeters === null || zoomMeters >= routeDistanceMeters) {
      return routeDistanceMeters;
    }
    return zoomMeters;
  }
}
