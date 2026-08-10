import { GeoCoordinate } from './geo-coordinate';

export interface RouteLocation {
  readonly coordinate: GeoCoordinate;
  readonly elevationMeters: number | null;
  readonly gradientPercent: number;
  readonly distanceMeters: number;
  readonly segmentIndex: number;
}

export class RoutePoint implements RouteLocation {
  constructor(
    readonly coordinate: GeoCoordinate,
    readonly elevationMeters: number | null,
    readonly gradientPercent: number,
    readonly distanceMeters: number,
    readonly segmentIndex: number,
  ) {}

  locationTowards(nextPoint: RoutePoint, requestedDistanceMeters: number): RouteLocation {
    const distanceSpan = nextPoint.distanceMeters - this.distanceMeters;
    if (distanceSpan <= 0) {
      return this.asLocation(requestedDistanceMeters);
    }
    const ratio = (requestedDistanceMeters - this.distanceMeters) / distanceSpan;
    const coordinate = this.coordinate.interpolateTowards(nextPoint.coordinate, ratio);
    const elevationMeters = this.interpolateElevation(nextPoint, ratio);
    const gradientPercent =
      this.gradientPercent + (nextPoint.gradientPercent - this.gradientPercent) * ratio;
    return {
      coordinate,
      elevationMeters,
      gradientPercent,
      distanceMeters: requestedDistanceMeters,
      segmentIndex: this.segmentIndex,
    };
  }

  asLocation(distanceMeters = this.distanceMeters): RouteLocation {
    return {
      coordinate: this.coordinate,
      elevationMeters: this.elevationMeters,
      gradientPercent: this.gradientPercent,
      distanceMeters,
      segmentIndex: this.segmentIndex,
    };
  }

  private interpolateElevation(nextPoint: RoutePoint, ratio: number): number | null {
    if (this.elevationMeters === null) {
      return nextPoint.elevationMeters;
    }
    if (nextPoint.elevationMeters === null) {
      return this.elevationMeters;
    }
    return this.elevationMeters + (nextPoint.elevationMeters - this.elevationMeters) * ratio;
  }
}
