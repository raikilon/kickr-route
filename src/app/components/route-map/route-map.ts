import { DOCUMENT } from '@angular/common';
import {
  AfterViewInit,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  linkedSignal,
  signal,
  ViewChild,
} from '@angular/core';
import { RideService } from '../../core/ride/ride.service';
import { RouteLocation } from '../../core/route/route-point';
import { Route } from '../../core/route/route';
import { DurationPipe } from '../../shared/duration.pipe';
import { RouteMapProjection } from './projection/route-map-projection';
import { MapLibreRouteRenderer, type RouteMapBasemap } from './rendering/maplibre-route-renderer';

@Component({
  selector: 'app-route-map',
  imports: [DurationPipe],
  templateUrl: './route-map.html',
  styleUrl: './route-map.scss',
})
export class RouteMap implements AfterViewInit {
  @ViewChild('mapShell') private mapShell?: ElementRef<HTMLElement>;
  @ViewChild('mapContainer') private mapContainer?: ElementRef<HTMLDivElement>;

  readonly route = input<Route | null>(null);
  readonly distanceMeters = input(0);
  readonly position = input<RouteLocation | null>(null);
  protected readonly autoFollow = signal(true);
  protected readonly basemap = signal<RouteMapBasemap>('street');
  protected readonly terrainEnabled = signal(false);
  protected readonly headingUp = signal(false);
  protected readonly gradientColors = linkedSignal({
    source: this.route,
    computation: () => false,
  });
  protected readonly gradientColorsAvailable = computed(() => this.route()?.hasElevation ?? false);
  protected readonly followLabel = computed(() => {
    if (this.autoFollow()) {
      return 'Auto-follow on';
    }
    return 'Auto-follow off';
  });
  protected readonly orientationLabel = computed(() => {
    if (this.headingUp()) {
      return 'Heading up';
    }
    return 'North up';
  });
  protected readonly tileWarning = signal(false);
  protected readonly mapError = signal<string | null>(null);
  protected readonly fullscreenAvailable = signal(false);
  protected readonly isFullscreen = signal(false);
  protected readonly fullscreenLabel = computed(() => {
    if (this.isFullscreen()) {
      return 'Exit full screen';
    }
    return 'Full screen';
  });
  protected readonly ride = inject(RideService);
  protected readonly powerWatts = computed(() => this.ride.telemetry()?.powerWatts ?? 0);
  protected readonly cadenceRpm = computed(() => this.ride.telemetry()?.cadenceRpm ?? 0);
  protected readonly speedKph = computed(() => this.ride.telemetry()?.speedKph ?? 0);

  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly rendererReady = signal(false);
  private renderer: MapLibreRouteRenderer | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private destroyed = false;

  constructor() {
    effect(() => this.renderRoute());
    this.document.addEventListener('fullscreenchange', this.handleFullscreenChange);
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.document.removeEventListener('fullscreenchange', this.handleFullscreenChange);
      this.destroyMap();
    });
  }

  ngAfterViewInit(): void {
    const shell = this.mapShell?.nativeElement;
    this.fullscreenAvailable.set(
      Boolean(shell && this.document.fullscreenEnabled && shell.requestFullscreen),
    );
    const element = this.mapContainer?.nativeElement;
    if (!element) {
      return;
    }
    this.observeMapSize(element);
    void this.initializeRenderer(element);
  }

  protected toggleFollow(): void {
    this.autoFollow.update((enabled) => !enabled);
  }

  protected selectBasemap(basemap: RouteMapBasemap): void {
    this.basemap.set(basemap);
  }

  protected toggleTerrain(): void {
    this.terrainEnabled.update((enabled) => !enabled);
  }

  protected toggleOrientation(): void {
    this.headingUp.update((enabled) => !enabled);
  }

  protected toggleGradientColors(): void {
    if (!this.gradientColorsAvailable()) {
      return;
    }
    this.gradientColors.update((enabled) => !enabled);
  }

  protected async toggleFullscreen(): Promise<void> {
    const shell = this.mapShell?.nativeElement;
    if (!shell || !this.fullscreenAvailable()) {
      return;
    }
    try {
      if (this.document.fullscreenElement === shell) {
        await this.document.exitFullscreen();
        return;
      }
      await shell.requestFullscreen();
    } catch (error) {
      console.warn('Route map fullscreen request failed.', error);
    }
  }

  private readonly handleFullscreenChange = (): void => {
    this.isFullscreen.set(this.document.fullscreenElement === this.mapShell?.nativeElement);
    this.renderer?.resize();
  };

  private async initializeRenderer(element: HTMLDivElement): Promise<void> {
    try {
      const renderer = await MapLibreRouteRenderer.create(element, (available) =>
        this.tileWarning.set(!available),
      );
      if (this.destroyed) {
        renderer.destroy();
        return;
      }
      this.renderer = renderer;
      this.rendererReady.set(true);
    } catch (error) {
      this.mapError.set(this.errorMessage(error));
      console.error('Route map initialization failed.', error);
    }
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return 'This browser could not start the WebGL map.';
  }

  private renderRoute(): void {
    const route = this.route();
    const distanceMeters = this.distanceMeters();
    const position = this.position();
    const autoFollow = this.autoFollow();
    const basemap = this.basemap();
    const terrainEnabled = this.terrainEnabled();
    const headingUp = this.headingUp();
    const gradientColors = this.gradientColors();
    if (!route || !this.rendererReady() || !this.renderer) {
      return;
    }
    const projection = new RouteMapProjection(route, distanceMeters, position).project();
    this.renderer.render(projection, {
      autoFollow,
      basemap,
      gradientColors,
      terrainEnabled,
      headingUp,
    });
  }

  private observeMapSize(element: HTMLDivElement): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    this.resizeObserver = new ResizeObserver(() => this.renderer?.resize());
    this.resizeObserver.observe(element);
  }

  private destroyMap(): void {
    this.resizeObserver?.disconnect();
    this.renderer?.destroy();
  }
}
