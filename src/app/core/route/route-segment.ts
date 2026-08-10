import { ElevationSeries } from './elevation-series';
import { GeoCoordinate } from './geo-coordinate';
import { RouteLocation, RoutePoint } from './route-point';
import { RouteProcessingPolicy } from './route-processing-policy';

export interface RawRoutePoint {
  readonly coordinate: GeoCoordinate;
  readonly elevationMeters: number | null;
}

export interface GradientRange {
  readonly minimumPercent: number;
  readonly maximumPercent: number;
}

export class RouteSegment {
  readonly points: readonly RoutePoint[];
  readonly lengthMeters: number;
  readonly ascentMeters: number;
  readonly hasElevation: boolean;

  constructor(
    readonly index: number,
    readonly startDistanceMeters: number,
    rawPoints: readonly RawRoutePoint[],
    policy: RouteProcessingPolicy,
  ) {
    if (rawPoints.length === 0) {
      throw new Error('A route segment must contain at least one point.');
    }
    const localDistancesMeters = this.calculateLocalDistances(rawPoints);
    const elevations = new ElevationSeries(
      rawPoints.map((point) => point.elevationMeters),
      localDistancesMeters,
      policy.elevationSmoothingWindowMeters,
    );
    this.hasElevation = elevations.hasElevation;
    this.points = this.createPoints(rawPoints, localDistancesMeters, elevations, policy);
    this.lengthMeters = localDistancesMeters.at(-1) ?? 0;
    this.ascentMeters = this.calculateAscent(this.points);
  }

  get endDistanceMeters(): number {
    return this.startDistanceMeters + this.lengthMeters;
  }

  containsDistance(distanceMeters: number): boolean {
    return distanceMeters >= this.startDistanceMeters && distanceMeters <= this.endDistanceMeters;
  }

  locationAt(distanceMeters: number): RouteLocation {
    if (distanceMeters <= this.startDistanceMeters) {
      return this.points[0].asLocation(this.startDistanceMeters);
    }
    if (distanceMeters >= this.endDistanceMeters) {
      return this.points.at(-1)!.asLocation(this.endDistanceMeters);
    }
    const nextPointIndex = this.findFirstPointIndexAtOrAfter(distanceMeters);
    const previousPoint = this.points[nextPointIndex - 1];
    return previousPoint.locationTowards(this.points[nextPointIndex], distanceMeters);
  }

  ascentAt(distanceMeters: number): number {
    if (distanceMeters <= this.startDistanceMeters) {
      return 0;
    }
    if (distanceMeters >= this.endDistanceMeters) {
      return this.ascentMeters;
    }
    let ascentMeters = 0;
    for (let index = 1; index < this.points.length; index += 1) {
      const previousPoint = this.points[index - 1];
      const nextPoint = this.points[index];
      if (distanceMeters <= previousPoint.distanceMeters) {
        return ascentMeters;
      }
      const completedElevation = this.completedElevation(previousPoint, nextPoint, distanceMeters);
      ascentMeters += this.positiveElevationChange(
        previousPoint.elevationMeters,
        completedElevation,
      );
      if (distanceMeters < nextPoint.distanceMeters) {
        return ascentMeters;
      }
    }
    return ascentMeters;
  }

  gradientRangeAt(distanceMeters: number): GradientRange {
    const gradients = this.points
      .filter((point) => point.distanceMeters <= distanceMeters)
      .map((point) => point.gradientPercent);
    gradients.push(this.locationAt(distanceMeters).gradientPercent);
    return {
      minimumPercent: Math.min(...gradients),
      maximumPercent: Math.max(...gradients),
    };
  }

  private calculateLocalDistances(rawPoints: readonly RawRoutePoint[]): number[] {
    const distancesMeters = [0];
    for (let index = 1; index < rawPoints.length; index += 1) {
      const previousDistance = distancesMeters[index - 1];
      const edgeDistance = rawPoints[index - 1].coordinate.distanceTo(rawPoints[index].coordinate);
      distancesMeters.push(previousDistance + edgeDistance);
    }
    return distancesMeters;
  }

  private createPoints(
    rawPoints: readonly RawRoutePoint[],
    localDistancesMeters: readonly number[],
    elevations: ElevationSeries,
    policy: RouteProcessingPolicy,
  ): RoutePoint[] {
    return rawPoints.map((rawPoint, index) => {
      const localDistanceMeters = localDistancesMeters[index];
      return new RoutePoint(
        rawPoint.coordinate,
        elevations.elevationAtIndex(index),
        elevations.gradientPercentAt(localDistanceMeters, policy.gradientWindowMeters),
        this.startDistanceMeters + localDistanceMeters,
        this.index,
      );
    });
  }

  private calculateAscent(points: readonly RoutePoint[]): number {
    let ascentMeters = 0;
    for (let index = 1; index < points.length; index += 1) {
      ascentMeters += this.positiveElevationChange(
        points[index - 1].elevationMeters,
        points[index].elevationMeters,
      );
    }
    return ascentMeters;
  }

  private positiveElevationChange(
    firstElevationMeters: number | null,
    secondElevationMeters: number | null,
  ): number {
    if (firstElevationMeters === null || secondElevationMeters === null) {
      return 0;
    }
    return Math.max(0, secondElevationMeters - firstElevationMeters);
  }

  private completedElevation(
    previousPoint: RoutePoint,
    nextPoint: RoutePoint,
    distanceMeters: number,
  ): number | null {
    if (distanceMeters >= nextPoint.distanceMeters) {
      return nextPoint.elevationMeters;
    }
    return previousPoint.locationTowards(nextPoint, distanceMeters).elevationMeters;
  }

  private findFirstPointIndexAtOrAfter(distanceMeters: number): number {
    let lowIndex = 0;
    let highIndex = this.points.length - 1;
    while (lowIndex < highIndex) {
      const middleIndex = Math.floor((lowIndex + highIndex) / 2);
      if (this.points[middleIndex].distanceMeters < distanceMeters) {
        lowIndex = middleIndex + 1;
        continue;
      }
      highIndex = middleIndex;
    }
    return lowIndex;
  }
}
