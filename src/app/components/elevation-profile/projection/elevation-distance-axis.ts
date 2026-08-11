import type { DistanceGuide, DistanceTick } from './elevation-profile-projector';
import { ElevationViewport } from './elevation-viewport';

export interface ElevationDistanceAxisProjection {
  readonly ticks: readonly DistanceTick[];
  readonly guides: readonly DistanceGuide[];
}

export class ElevationDistanceAxis {
  constructor(private readonly viewport: ElevationViewport) {}

  project(): ElevationDistanceAxisProjection {
    const stepMeters = this.tickStepMeters();
    return {
      ticks: this.ticks(stepMeters),
      guides: this.guides(stepMeters),
    };
  }

  private tickStepMeters(): number {
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

  private ticks(stepMeters: number): DistanceTick[] {
    const ticks: DistanceTick[] = [];
    const firstIndex = Math.ceil(this.viewport.startMeters / stepMeters);
    const lastIndex = Math.floor(this.viewport.endMeters / stepMeters);
    for (let index = firstIndex; index <= lastIndex; index += 1) {
      const distanceMeters = index * stepMeters;
      const x = this.viewport.xForDistance(distanceMeters);
      ticks.push({
        distanceMeters,
        x,
        labelX: Math.min(this.viewport.width - 30, Math.max(30, x)),
        label: this.tickLabel(distanceMeters, stepMeters),
      });
    }
    return ticks;
  }

  private guides(stepMeters: number): DistanceGuide[] {
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
        x: this.viewport.xForDistance(distanceMeters),
      });
    }
    return guides;
  }

  private tickLabel(distanceMeters: number, stepMeters: number): string {
    let fractionDigits = 2;
    if (stepMeters >= 100) {
      fractionDigits = 1;
    }
    if (stepMeters >= 1_000) {
      fractionDigits = 0;
    }
    return `${(distanceMeters / 1_000).toFixed(fractionDigits)} km`;
  }
}
