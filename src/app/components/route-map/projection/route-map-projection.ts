import { GeoCoordinate } from '../../../core/route/geo-coordinate';
import { RouteLocation } from '../../../core/route/route-point';
import { RouteSegment } from '../../../core/route/route-segment';
import { Route } from '../../../core/route/route';

export interface RouteMapView {
  readonly route: Route;
  readonly completedPaths: readonly (readonly GeoCoordinate[])[];
  readonly remainingPaths: readonly (readonly GeoCoordinate[])[];
  readonly start: GeoCoordinate;
  readonly finish: GeoCoordinate;
  readonly rider: GeoCoordinate | null;
  readonly headingDegrees: number | null;
}

export class RouteMapProjection {
  constructor(
    private readonly route: Route,
    private readonly distanceMeters: number,
    private readonly location: RouteLocation | null,
  ) {}

  project(): RouteMapView {
    const completedPaths: GeoCoordinate[][] = [];
    const remainingPaths: GeoCoordinate[][] = [];
    this.route.segments.forEach((segment) => {
      const completedPath = segment.points
        .filter((point) => point.distanceMeters <= this.distanceMeters)
        .map((point) => point.coordinate);
      const remainingPath = segment.points
        .filter((point) => point.distanceMeters >= this.distanceMeters)
        .map((point) => point.coordinate);
      this.insertCurrentLocation(completedPath, remainingPath, segment);
      this.addUsablePath(completedPaths, completedPath);
      this.addUsablePath(remainingPaths, remainingPath);
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
    completedPath: GeoCoordinate[],
    remainingPath: GeoCoordinate[],
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
    completedPath.push(this.location.coordinate);
    remainingPath.unshift(this.location.coordinate);
  }

  private addUsablePath(paths: GeoCoordinate[][], candidate: GeoCoordinate[]): void {
    if (candidate.length >= 2) {
      paths.push(candidate);
    }
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
