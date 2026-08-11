import { GradientDifficulty } from '../../../core/route/gradient-difficulty-scale';
import { Route } from '../../../core/route/route';
import { ElevationDistanceAxis } from './elevation-distance-axis';
import { ElevationPathProjector } from './elevation-path-projector';
import { ElevationViewport } from './elevation-viewport';

export interface ColoredElevationPath {
  readonly path: string;
  readonly difficulty: GradientDifficulty;
}

export interface DistanceTick {
  readonly distanceMeters: number;
  readonly x: number;
  readonly labelX: number;
  readonly label: string;
}

export interface DistanceGuide {
  readonly distanceMeters: number;
  readonly x: number;
}

export interface ElevationProfileProjection {
  readonly paths: readonly ColoredElevationPath[];
  readonly unknownPaths: readonly string[];
  readonly distanceTicks: readonly DistanceTick[];
  readonly distanceGuides: readonly DistanceGuide[];
  readonly legend: readonly GradientDifficulty[];
  readonly minimumElevationMeters: number | null;
  readonly maximumElevationMeters: number | null;
  readonly markerX: number;
  readonly markerY: number | null;
  readonly viewportStartMeters: number;
  readonly viewportEndMeters: number;
  readonly isFullRoute: boolean;
}

export class ElevationProfileProjector {
  private readonly riderDistanceMeters: number;
  private readonly viewport: ElevationViewport;
  private readonly distanceAxis: ElevationDistanceAxis;
  private readonly pathProjector: ElevationPathProjector;

  constructor(
    private readonly route: Route,
    distanceMeters: number,
    zoomMeters: number | null,
  ) {
    this.riderDistanceMeters = route.clampDistance(distanceMeters);
    this.viewport = new ElevationViewport(
      route.totalDistanceMeters,
      this.riderDistanceMeters,
      zoomMeters,
    );
    this.distanceAxis = new ElevationDistanceAxis(this.viewport);
    this.pathProjector = new ElevationPathProjector(route, this.viewport);
  }

  project(): ElevationProfileProjection | null {
    if (!this.route.hasElevation) {
      return null;
    }
    const axis = this.distanceAxis.project();
    const elevation = this.pathProjector.project(this.riderDistanceMeters);
    return {
      paths: elevation.paths,
      unknownPaths: elevation.unknownPaths,
      distanceTicks: axis.ticks,
      distanceGuides: axis.guides,
      legend: elevation.legend,
      minimumElevationMeters: elevation.minimumElevationMeters,
      maximumElevationMeters: elevation.maximumElevationMeters,
      markerX: elevation.markerX,
      markerY: elevation.markerY,
      viewportStartMeters: this.viewport.startMeters,
      viewportEndMeters: this.viewport.endMeters,
      isFullRoute: this.viewport.isFullRoute,
    };
  }
}
