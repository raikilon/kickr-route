import { GeoCoordinate } from '../../../core/route/geo-coordinate';
import { GradientDifficultyScale } from '../../../core/route/gradient-difficulty-scale';
import { RouteLocation } from '../../../core/route/route-point';
import { RouteSegment } from '../../../core/route/route-segment';
import { Route } from '../../../core/route/route';

export interface RouteMapPath {
  readonly coordinates: readonly GeoCoordinate[];
  readonly gradientColor: string;
}

export interface RouteMapView {
  readonly route: Route;
  readonly completedPaths: readonly RouteMapPath[];
  readonly remainingPaths: readonly RouteMapPath[];
  readonly start: GeoCoordinate;
  readonly finish: GeoCoordinate;
  readonly rider: GeoCoordinate | null;
  readonly headingDegrees: number | null;
}

export class RouteMapProjection {
  private readonly difficultyScale = new GradientDifficultyScale();

  constructor(
    private readonly route: Route,
    private readonly distanceMeters: number,
    private readonly location: RouteLocation | null,
  ) {}

  project(): RouteMapView {
    const completedPaths: RouteMapPath[] = [];
    const remainingPaths: RouteMapPath[] = [];
    this.route.segments.forEach((segment) => {
      const completedLocations: RouteLocation[] = segment.points.filter(
        (point) => point.distanceMeters <= this.distanceMeters,
      );
      const remainingLocations: RouteLocation[] = segment.points.filter(
        (point) => point.distanceMeters >= this.distanceMeters,
      );
      this.insertCurrentLocation(completedLocations, remainingLocations, segment);
      this.addColoredPaths(completedPaths, completedLocations, segment);
      this.addColoredPaths(remainingPaths, remainingLocations, segment);
    });
    return {
      route: this.route,
      completedPaths,
      remainingPaths,
      start: this.route.points[0].coordinate,
      finish: this.route.points.at(-1)!.coordinate,
      rider: this.riderCoordinate(),
      headingDegrees: this.riderHeading(),
    };
  }

  private insertCurrentLocation(
    completedLocations: RouteLocation[],
    remainingLocations: RouteLocation[],
    segment: RouteSegment,
  ): void {
    if (!this.location || this.location.segmentIndex !== segment.index) {
      return;
    }
    if (
      this.distanceMeters <= segment.startDistanceMeters ||
      this.distanceMeters >= segment.endDistanceMeters
    ) {
      return;
    }
    completedLocations.push(this.location);
    remainingLocations.unshift(this.location);
  }

  private addColoredPaths(
    paths: RouteMapPath[],
    locations: readonly RouteLocation[],
    segment: RouteSegment,
  ): void {
    if (locations.length < 2) {
      return;
    }
    let activeColor = this.edgeColor(locations[0], locations[1], segment);
    let coordinates = [locations[0].coordinate];
    for (let index = 1; index < locations.length; index += 1) {
      const color = this.edgeColor(locations[index - 1], locations[index], segment);
      if (color !== activeColor) {
        paths.push({ coordinates, gradientColor: activeColor });
        coordinates = [locations[index - 1].coordinate];
        activeColor = color;
      }
      coordinates.push(locations[index].coordinate);
    }
    paths.push({ coordinates, gradientColor: activeColor });
  }

  private edgeColor(first: RouteLocation, second: RouteLocation, segment: RouteSegment): string {
    if (first.elevationMeters === null || second.elevationMeters === null) {
      return '#53616d';
    }
    const midpointMeters =
      first.distanceMeters + (second.distanceMeters - first.distanceMeters) / 2;
    return this.difficultyScale.classify(segment.locationAt(midpointMeters).gradientPercent).color;
  }

  private riderCoordinate(): GeoCoordinate | null {
    if (!this.location) {
      return null;
    }
    return this.location.coordinate;
  }

  private riderHeading(): number | null {
    if (!this.location) {
      return null;
    }
    return this.route.headingAt(this.distanceMeters);
  }
}
