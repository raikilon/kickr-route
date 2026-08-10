import { Component, computed, input, linkedSignal } from '@angular/core';
import { Route } from '../../core/route/route';
import { ElevationProfileProjector } from './projection/elevation-profile-projector';

@Component({
  selector: 'app-elevation-profile',
  templateUrl: './elevation-profile.html',
  styleUrl: './elevation-profile.scss',
})
export class ElevationProfile {
  readonly route = input<Route | null>(null);
  readonly distanceMeters = input(0);

  private readonly zoomLevelsMeters: readonly (number | null)[] = [
    null,
    10_000,
    5_000,
    2_000,
    1_000,
  ];
  private readonly selectedZoomIndex = linkedSignal({
    source: this.route,
    computation: () => 0,
  });
  private readonly availableZoomLevels = computed(() => {
    const route = this.route();
    if (!route) {
      return [null];
    }
    return this.zoomLevelsMeters.filter((zoomMeters) => {
      if (zoomMeters === null) {
        return true;
      }
      return zoomMeters < route.totalDistanceMeters;
    });
  });
  private readonly selectedZoomMeters = computed(() => {
    return this.availableZoomLevels()[this.selectedZoomIndex()] ?? null;
  });

  protected readonly profile = computed(() => {
    const route = this.route();
    if (!route) {
      return null;
    }
    return new ElevationProfileProjector(
      route,
      this.distanceMeters(),
      this.selectedZoomMeters(),
    ).project();
  });
  protected readonly zoomLabel = computed(() => {
    const zoomMeters = this.selectedZoomMeters();
    if (zoomMeters === null) {
      const route = this.route();
      if (!route) {
        return '0 km';
      }
      return `${(route.totalDistanceMeters / 1_000).toFixed(1)} km`;
    }
    return `${(zoomMeters / 1_000).toFixed(0)} km`;
  });
  protected readonly canZoomIn = computed(() => {
    return this.selectedZoomIndex() < this.availableZoomLevels().length - 1;
  });
  protected readonly canZoomOut = computed(() => this.selectedZoomIndex() > 0);

  protected zoomIn(): void {
    if (!this.canZoomIn()) {
      return;
    }
    this.selectedZoomIndex.update((index) => index + 1);
  }

  protected zoomOut(): void {
    if (!this.canZoomOut()) {
      return;
    }
    this.selectedZoomIndex.update((index) => index - 1);
  }

  protected showFullRoute(): void {
    this.selectedZoomIndex.set(0);
  }
}
