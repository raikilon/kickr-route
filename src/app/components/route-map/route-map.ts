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
import { RouteLocation } from '../../core/route/route-point';
import { Route } from '../../core/route/route';
import { RouteMapProjection } from './projection/route-map-projection';
import { MapLibreRouteRenderer, type RouteMapBasemap } from './rendering/maplibre-route-renderer';

@Component({
  selector: 'app-route-map',
  templateUrl: './route-map.html',
  styleUrl: './route-map.scss',
})
export class RouteMap implements AfterViewInit {
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

  private readonly destroyRef = inject(DestroyRef);
  private readonly rendererReady = signal(false);
  private renderer: MapLibreRouteRenderer | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private destroyed = false;

  constructor() {
    effect(() => this.renderRoute());
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.destroyMap();
    });
  }

  ngAfterViewInit(): void {
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
