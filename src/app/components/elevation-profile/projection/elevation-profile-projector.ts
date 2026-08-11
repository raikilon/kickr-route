import {
  GradientDifficulty,
  GradientDifficultyScale,
} from '../../../core/route/gradient-difficulty-scale';
import { RouteLocation, RoutePoint } from '../../../core/route/route-point';
import { RouteSegment } from '../../../core/route/route-segment';
import { Route } from '../../../core/route/route';

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

interface ProfileSample {
  readonly distanceMeters: number;
  readonly elevationMeters: number | null;
}

class ElevationViewport {
  readonly startMeters: number;
  readonly endMeters: number;
  readonly isFullRoute: boolean;

  constructor(routeDistanceMeters: number, riderDistanceMeters: number, zoomMeters: number | null) {
    const requestedSpanMeters = this.requestedSpan(routeDistanceMeters, zoomMeters);
    this.isFullRoute = requestedSpanMeters >= routeDistanceMeters;
    const maximumStartMeters = Math.max(0, routeDistanceMeters - requestedSpanMeters);
    const desiredStartMeters = riderDistanceMeters - requestedSpanMeters * 0.25;
    this.startMeters = Math.min(maximumStartMeters, Math.max(0, desiredStartMeters));
    this.endMeters = Math.min(routeDistanceMeters, this.startMeters + requestedSpanMeters);
  }

  xForDistance(distanceMeters: number, width: number): number {
    const clampedDistance = Math.min(this.endMeters, Math.max(this.startMeters, distanceMeters));
    const viewportSpan = Math.max(1, this.endMeters - this.startMeters);
    return ((clampedDistance - this.startMeters) / viewportSpan) * width;
  }

  private requestedSpan(routeDistanceMeters: number, zoomMeters: number | null): number {
    if (zoomMeters === null || zoomMeters >= routeDistanceMeters) {
      return routeDistanceMeters;
    }
    return zoomMeters;
  }
}

class ElevationPathRun {
  private readonly commands: string[];

  constructor(
    readonly difficulty: GradientDifficulty,
    startX: number,
    startY: number,
  ) {
    this.commands = [`M ${startX.toFixed(2)} ${startY.toFixed(2)}`];
  }

  append(x: number, y: number): void {
    this.commands.push(`L ${x.toFixed(2)} ${y.toFixed(2)}`);
  }

  project(): ColoredElevationPath {
    return { path: this.commands.join(' '), difficulty: this.difficulty };
  }
}

export class ElevationProfileProjector {
  private readonly width = 1_000;
  private readonly height = 320;
  private readonly topPadding = 20;
  private readonly bottomPadding = 48;
  private readonly plotBottom = this.height - this.bottomPadding;
  private readonly difficultyScale = new GradientDifficultyScale();
  private readonly viewport: ElevationViewport;

  constructor(
    private readonly route: Route,
    private readonly distanceMeters: number,
    zoomMeters: number | null,
  ) {
    this.viewport = new ElevationViewport(
      route.totalDistanceMeters,
      route.clampDistance(distanceMeters),
      zoomMeters,
    );
  }

  project(): ElevationProfileProjection | null {
    if (!this.route.hasElevation) {
      return null;
    }
    const samplesBySegment = this.visibleSamplesBySegment();
    const elevationsMeters = this.visibleElevations(samplesBySegment);
    const minimumElevationMeters = this.minimumElevation(elevationsMeters);
    const maximumElevationMeters = this.maximumElevation(elevationsMeters);
    const elevationSpanMeters = this.elevationSpan(minimumElevationMeters, maximumElevationMeters);
    return this.createProjection(
      samplesBySegment,
      minimumElevationMeters,
      maximumElevationMeters,
      elevationSpanMeters,
    );
  }

  private createProjection(
    samplesBySegment: ReadonlyMap<RouteSegment, readonly ProfileSample[]>,
    minimumElevationMeters: number | null,
    maximumElevationMeters: number | null,
    elevationSpanMeters: number,
  ): ElevationProfileProjection {
    const riderDistanceMeters = this.route.clampDistance(this.distanceMeters);
    const tickStepMeters = this.distanceTickStepMeters();
    return {
      paths: this.buildColoredPaths(samplesBySegment, minimumElevationMeters, elevationSpanMeters),
      unknownPaths: this.buildUnknownPaths(samplesBySegment),
      distanceTicks: this.distanceTicks(tickStepMeters),
      distanceGuides: this.distanceGuides(tickStepMeters),
      legend: this.difficultyScale.entries,
      minimumElevationMeters,
      maximumElevationMeters,
      markerX: this.viewport.xForDistance(riderDistanceMeters, this.width),
      markerY: this.markerY(riderDistanceMeters, minimumElevationMeters, elevationSpanMeters),
      viewportStartMeters: this.viewport.startMeters,
      viewportEndMeters: this.viewport.endMeters,
      isFullRoute: this.viewport.isFullRoute,
    };
  }

  private visibleSamplesBySegment(): ReadonlyMap<RouteSegment, readonly ProfileSample[]> {
    const samplesBySegment = new Map<RouteSegment, readonly ProfileSample[]>();
    this.route.segments.forEach((segment) => {
      if (!this.segmentIntersectsViewport(segment)) {
        return;
      }
      samplesBySegment.set(segment, this.visibleSamples(segment));
    });
    return samplesBySegment;
  }

  private visibleSamples(segment: RouteSegment): ProfileSample[] {
    const startMeters = Math.max(segment.startDistanceMeters, this.viewport.startMeters);
    const endMeters = Math.min(segment.endDistanceMeters, this.viewport.endMeters);
    const samples: ProfileSample[] = [this.sampleFromLocation(segment.locationAt(startMeters))];
    segment.points.forEach((point) =>
      this.addInteriorSample(samples, point, startMeters, endMeters),
    );
    if (endMeters > startMeters) {
      samples.push(this.sampleFromLocation(segment.locationAt(endMeters)));
    }
    return samples;
  }

  private addInteriorSample(
    samples: ProfileSample[],
    point: RoutePoint,
    startMeters: number,
    endMeters: number,
  ): void {
    if (point.distanceMeters <= startMeters || point.distanceMeters >= endMeters) {
      return;
    }
    samples.push({
      distanceMeters: point.distanceMeters,
      elevationMeters: point.elevationMeters,
    });
  }

  private buildColoredPaths(
    samplesBySegment: ReadonlyMap<RouteSegment, readonly ProfileSample[]>,
    minimumElevationMeters: number | null,
    elevationSpanMeters: number,
  ): ColoredElevationPath[] {
    if (minimumElevationMeters === null) {
      return [];
    }
    const paths: ColoredElevationPath[] = [];
    samplesBySegment.forEach((samples, segment) => {
      paths.push(
        ...this.coloredPathsForSegment(
          segment,
          samples,
          minimumElevationMeters,
          elevationSpanMeters,
        ),
      );
    });
    return paths;
  }

  private coloredPathsForSegment(
    segment: RouteSegment,
    samples: readonly ProfileSample[],
    minimumElevationMeters: number,
    elevationSpanMeters: number,
  ): ColoredElevationPath[] {
    const paths: ColoredElevationPath[] = [];
    let activeRun: ElevationPathRun | null = null;
    for (let index = 1; index < samples.length; index += 1) {
      const first = samples[index - 1];
      const second = samples[index];
      if (first.elevationMeters === null || second.elevationMeters === null) {
        activeRun = this.finishRun(paths, activeRun);
        continue;
      }
      const difficulty = this.edgeDifficulty(segment, first, second);
      activeRun = this.appendEdge(
        activeRun,
        paths,
        first,
        second,
        difficulty,
        minimumElevationMeters,
        elevationSpanMeters,
      );
    }
    this.finishRun(paths, activeRun);
    return paths;
  }

  private appendEdge(
    activeRun: ElevationPathRun | null,
    paths: ColoredElevationPath[],
    first: ProfileSample,
    second: ProfileSample,
    difficulty: GradientDifficulty,
    minimumElevationMeters: number,
    elevationSpanMeters: number,
  ): ElevationPathRun {
    let run = activeRun;
    if (!run || run.difficulty !== difficulty) {
      this.finishRun(paths, run);
      run = this.createRun(first, difficulty, minimumElevationMeters, elevationSpanMeters);
    }
    run.append(
      this.viewport.xForDistance(second.distanceMeters, this.width),
      this.yForElevation(second.elevationMeters!, minimumElevationMeters, elevationSpanMeters),
    );
    return run;
  }

  private createRun(
    sample: ProfileSample,
    difficulty: GradientDifficulty,
    minimumElevationMeters: number,
    elevationSpanMeters: number,
  ): ElevationPathRun {
    return new ElevationPathRun(
      difficulty,
      this.viewport.xForDistance(sample.distanceMeters, this.width),
      this.yForElevation(sample.elevationMeters!, minimumElevationMeters, elevationSpanMeters),
    );
  }

  private finishRun(paths: ColoredElevationPath[], activeRun: ElevationPathRun | null): null {
    if (activeRun) {
      paths.push(activeRun.project());
    }
    return null;
  }

  private buildUnknownPaths(
    samplesBySegment: ReadonlyMap<RouteSegment, readonly ProfileSample[]>,
  ): string[] {
    const paths: string[] = [];
    samplesBySegment.forEach((samples) => {
      if (samples.some((sample) => sample.elevationMeters !== null)) {
        return;
      }
      const first = samples[0];
      const last = samples.at(-1)!;
      paths.push(
        `M ${this.viewport.xForDistance(first.distanceMeters, this.width).toFixed(2)} ${this.plotBottom} ` +
          `L ${this.viewport.xForDistance(last.distanceMeters, this.width).toFixed(2)} ${this.plotBottom}`,
      );
    });
    return paths;
  }

  private markerY(
    riderDistanceMeters: number,
    minimumElevationMeters: number | null,
    elevationSpanMeters: number,
  ): number | null {
    if (minimumElevationMeters === null) {
      return null;
    }
    const elevationMeters = this.route.locationAt(riderDistanceMeters).elevationMeters;
    if (elevationMeters === null) {
      return null;
    }
    return this.yForElevation(elevationMeters, minimumElevationMeters, elevationSpanMeters);
  }

  private distanceTickStepMeters(): number {
    const visibleDistanceMeters = Math.max(1, this.viewport.endMeters - this.viewport.startMeters);
    const requestedStepMeters = visibleDistanceMeters / 6;
    const magnitudeMeters = 10 ** Math.floor(Math.log10(requestedStepMeters));
    const normalizedStep = requestedStepMeters / magnitudeMeters;
    if (normalizedStep <= 1) {
      return magnitudeMeters;
    }
    if (normalizedStep <= 2) {
      return magnitudeMeters * 2;
    }
    if (normalizedStep <= 5) {
      return magnitudeMeters * 5;
    }
    return magnitudeMeters * 10;
  }

  private distanceTicks(stepMeters: number): DistanceTick[] {
    const ticks: DistanceTick[] = [];
    const firstIndex = Math.ceil(this.viewport.startMeters / stepMeters);
    const lastIndex = Math.floor(this.viewport.endMeters / stepMeters);
    for (let index = firstIndex; index <= lastIndex; index += 1) {
      const distanceMeters = index * stepMeters;
      const x = this.viewport.xForDistance(distanceMeters, this.width);
      ticks.push({
        distanceMeters,
        x,
        labelX: Math.min(this.width - 30, Math.max(30, x)),
        label: this.distanceTickLabel(distanceMeters, stepMeters),
      });
    }
    return ticks;
  }

  private distanceGuides(stepMeters: number): DistanceGuide[] {
    const guides: DistanceGuide[] = [];
    const firstIndex = Math.ceil(this.viewport.startMeters / stepMeters - 0.5);
    const lastIndex = Math.floor(this.viewport.endMeters / stepMeters - 0.5);
    for (let index = firstIndex; index <= lastIndex; index += 1) {
      const distanceMeters = (index + 0.5) * stepMeters;
      if (
        distanceMeters <= this.viewport.startMeters ||
        distanceMeters >= this.viewport.endMeters
      ) {
        continue;
      }
      guides.push({
        distanceMeters,
        x: this.viewport.xForDistance(distanceMeters, this.width),
      });
    }
    return guides;
  }

  private distanceTickLabel(distanceMeters: number, stepMeters: number): string {
    let fractionDigits = 2;
    if (stepMeters >= 100) {
      fractionDigits = 1;
    }
    if (stepMeters >= 1_000) {
      fractionDigits = 0;
    }
    return `${(distanceMeters / 1_000).toFixed(fractionDigits)} km`;
  }

  private edgeDifficulty(
    segment: RouteSegment,
    first: ProfileSample,
    second: ProfileSample,
  ): GradientDifficulty {
    const midpointMeters =
      first.distanceMeters + (second.distanceMeters - first.distanceMeters) / 2;
    const gradientPercent = segment.locationAt(midpointMeters).gradientPercent;
    return this.difficultyScale.classify(gradientPercent);
  }

  private visibleElevations(
    samplesBySegment: ReadonlyMap<RouteSegment, readonly ProfileSample[]>,
  ): number[] {
    const elevationsMeters: number[] = [];
    samplesBySegment.forEach((samples) => {
      samples.forEach((sample) => {
        if (sample.elevationMeters !== null) {
          elevationsMeters.push(sample.elevationMeters);
        }
      });
    });
    return elevationsMeters;
  }

  private minimumElevation(elevationsMeters: readonly number[]): number | null {
    if (elevationsMeters.length === 0) {
      return null;
    }
    return Math.min(...elevationsMeters);
  }

  private maximumElevation(elevationsMeters: readonly number[]): number | null {
    if (elevationsMeters.length === 0) {
      return null;
    }
    return Math.max(...elevationsMeters);
  }

  private elevationSpan(minimumMeters: number | null, maximumMeters: number | null): number {
    if (minimumMeters === null || maximumMeters === null) {
      return 1;
    }
    return Math.max(1, maximumMeters - minimumMeters);
  }

  private yForElevation(
    elevationMeters: number,
    minimumElevationMeters: number,
    elevationSpanMeters: number,
  ): number {
    const chartHeight = this.height - this.topPadding - this.bottomPadding;
    const normalizedElevation = (elevationMeters - minimumElevationMeters) / elevationSpanMeters;
    return this.topPadding + (1 - normalizedElevation) * chartHeight;
  }

  private sampleFromLocation(location: RouteLocation): ProfileSample {
    return {
      distanceMeters: location.distanceMeters,
      elevationMeters: location.elevationMeters,
    };
  }

  private segmentIntersectsViewport(segment: RouteSegment): boolean {
    return (
      segment.endDistanceMeters >= this.viewport.startMeters &&
      segment.startDistanceMeters <= this.viewport.endMeters
    );
  }
}
