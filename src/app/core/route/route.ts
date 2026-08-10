import { RouteLocation, RoutePoint } from './route-point';
import { GradientRange, RouteSegment } from './route-segment';

export class Route {
  readonly points: readonly RoutePoint[];
  readonly totalDistanceMeters: number;
  readonly totalAscentMeters: number;
  readonly hasElevation: boolean;

  constructor(
    readonly name: string,
    readonly segments: readonly RouteSegment[],
    readonly warnings: readonly string[] = [],
  ) {
    if (segments.length === 0) {
      throw new Error('A route must contain at least one segment.');
    }
    this.points = segments.flatMap((segment) => [...segment.points]);
    if (this.points.length < 2) {
      throw new Error('A route must contain at least two points.');
    }
    this.totalDistanceMeters = segments.at(-1)!.endDistanceMeters;
    if (this.totalDistanceMeters <= 0) {
      throw new Error('A route must have a measurable distance.');
    }
    this.totalAscentMeters = segments.reduce(
      (totalAscent, segment) => totalAscent + segment.ascentMeters,
      0,
    );
    this.hasElevation = segments.some((segment) => segment.hasElevation);
  }

  locationAt(requestedDistanceMeters: number): RouteLocation {
    const distanceMeters = this.clampDistance(requestedDistanceMeters);
    if (distanceMeters <= 0) {
      return this.points[0].asLocation(0);
    }
    if (distanceMeters >= this.totalDistanceMeters) {
      return this.points.at(-1)!.asLocation(this.totalDistanceMeters);
    }
    const segment = this.segmentAt(distanceMeters);
    return segment.locationAt(distanceMeters);
  }

  ascentAt(requestedDistanceMeters: number): number {
    const distanceMeters = this.clampDistance(requestedDistanceMeters);
    let ascentMeters = 0;
    for (const segment of this.segments) {
      if (distanceMeters >= segment.endDistanceMeters) {
        ascentMeters += segment.ascentMeters;
        continue;
      }
      ascentMeters += segment.ascentAt(distanceMeters);
      return ascentMeters;
    }
    return ascentMeters;
  }

  gradientRangeAt(requestedDistanceMeters: number): GradientRange {
    const distanceMeters = this.clampDistance(requestedDistanceMeters);
    const ranges = this.segments
      .filter((segment) => distanceMeters >= segment.startDistanceMeters)
      .map((segment) =>
        segment.gradientRangeAt(Math.min(distanceMeters, segment.endDistanceMeters)),
      );
    return {
      minimumPercent: Math.min(...ranges.map((range) => range.minimumPercent)),
      maximumPercent: Math.max(...ranges.map((range) => range.maximumPercent)),
    };
  }

  completionPercentageAt(distanceMeters: number): number {
    return (this.clampDistance(distanceMeters) / this.totalDistanceMeters) * 100;
  }

  remainingDistanceAt(distanceMeters: number): number {
    return this.totalDistanceMeters - this.clampDistance(distanceMeters);
  }

  headingAt(requestedDistanceMeters: number, lookaheadMeters = 20): number {
    const distanceMeters = this.clampDistance(requestedDistanceMeters);
    let firstDistanceMeters = distanceMeters;
    const secondDistanceMeters = this.clampDistance(distanceMeters + lookaheadMeters);
    if (secondDistanceMeters <= firstDistanceMeters) {
      firstDistanceMeters = this.clampDistance(distanceMeters - lookaheadMeters);
    }
    const firstCoordinate = this.locationAt(firstDistanceMeters).coordinate;
    const secondCoordinate = this.locationAt(secondDistanceMeters).coordinate;
    return firstCoordinate.bearingTo(secondCoordinate);
  }

  clampDistance(distanceMeters: number): number {
    return Math.min(this.totalDistanceMeters, Math.max(0, distanceMeters));
  }

  private segmentAt(distanceMeters: number): RouteSegment {
    const matchingSegment = this.segments.find((segment) =>
      segment.containsDistance(distanceMeters),
    );
    if (matchingSegment) {
      return matchingSegment;
    }
    return this.segments.at(-1)!;
  }
}
