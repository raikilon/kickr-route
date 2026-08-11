import {
  GradientDifficulty,
  GradientDifficultyScale,
} from '../../../core/route/gradient-difficulty-scale';
import { RouteLocation, RoutePoint } from '../../../core/route/route-point';
import { RouteSegment } from '../../../core/route/route-segment';
import { Route } from '../../../core/route/route';
import type { ColoredElevationPath } from './elevation-profile-projector';
import { ElevationViewport } from './elevation-viewport';

interface ProfileSample {
  readonly distanceMeters: number;
  readonly elevationMeters: number | null;
}

export interface ElevationPathProjection {
  readonly paths: readonly ColoredElevationPath[];
  readonly unknownPaths: readonly string[];
  readonly legend: readonly GradientDifficulty[];
  readonly minimumElevationMeters: number | null;
  readonly maximumElevationMeters: number | null;
  readonly markerX: number;
  readonly markerY: number | null;
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

export class ElevationPathProjector {
  private readonly height = 320;
  private readonly topPadding = 20;
  private readonly bottomPadding = 48;
  private readonly plotBottom = this.height - this.bottomPadding;
  private readonly difficultyScale = new GradientDifficultyScale();

  constructor(
    private readonly route: Route,
    private readonly viewport: ElevationViewport,
  ) {}

  project(riderDistanceMeters: number): ElevationPathProjection {
    const samplesBySegment = this.visibleSamplesBySegment();
    const elevationsMeters = this.visibleElevations(samplesBySegment);
    const minimumElevationMeters = this.minimumElevation(elevationsMeters);
    const maximumElevationMeters = this.maximumElevation(elevationsMeters);
    const elevationSpanMeters = this.elevationSpan(minimumElevationMeters, maximumElevationMeters);
    return {
      paths: this.buildColoredPaths(samplesBySegment, minimumElevationMeters, elevationSpanMeters),
      unknownPaths: this.buildUnknownPaths(samplesBySegment),
      legend: this.difficultyScale.entries,
      minimumElevationMeters,
      maximumElevationMeters,
      markerX: this.viewport.xForDistance(riderDistanceMeters),
      markerY: this.markerY(riderDistanceMeters, minimumElevationMeters, elevationSpanMeters),
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
      this.viewport.xForDistance(second.distanceMeters),
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
      this.viewport.xForDistance(sample.distanceMeters),
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
        `M ${this.viewport.xForDistance(first.distanceMeters).toFixed(2)} ${this.plotBottom} ` +
          `L ${this.viewport.xForDistance(last.distanceMeters).toFixed(2)} ${this.plotBottom}`,
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
