import type { EaseToOptions, Map as MapLibreMap } from 'maplibre-gl';
import type { Position } from 'geojson';
import { GeoCoordinate } from '../../../core/route/geo-coordinate';
import { Route } from '../../../core/route/route';
import { RouteMapView } from '../projection/route-map-projection';

const INITIAL_FOLLOW_ZOOM = 15;

export interface MapLibreRouteCameraOptions {
  readonly terrainEnabled: boolean;
  readonly headingUp: boolean;
  readonly autoFollow: boolean;
}

export class MapLibreRouteCamera {
  private lastFittedRoute: Route | null = null;
  private pendingInitialFollowRoute: Route | null = null;
  private terrainEnabled = false;
  private waitingForTerrain = false;
  private terrainTransitionId = 0;
  private terrainTransitionStage: 'pitch' | 'follow' | null = null;
  private terrainTransitionInitialFollow = false;
  private pendingTerrainCamera: {
    readonly view: RouteMapView;
    readonly options: MapLibreRouteCameraOptions;
  } | null = null;

  constructor(
    private readonly map: MapLibreMap,
    private readonly maplibre: typeof import('maplibre-gl'),
    private readonly terrainSourceId: string,
  ) {}

  fitNewRoute(route: Route): void {
    if (this.lastFittedRoute === route) {
      return;
    }
    const bounds = new this.maplibre.LngLatBounds();
    route.points.forEach((point) =>
      bounds.extend(this.position(point.coordinate) as [number, number]),
    );
    this.map.resize();
    this.map.fitBounds(bounds, { padding: 28, maxZoom: 15, duration: 0 });
    this.lastFittedRoute = route;
    this.pendingInitialFollowRoute = route;
  }

  setTerrainEnabled(enabled: boolean): void {
    if (this.terrainEnabled === enabled) {
      return;
    }
    this.terrainEnabled = enabled;
    this.terrainTransitionId += 1;
    this.terrainTransitionStage = null;
    this.pendingTerrainCamera = null;
    if (enabled) {
      this.waitingForTerrain = true;
      return;
    }
    this.waitingForTerrain = false;
  }

  update(view: RouteMapView, options: MapLibreRouteCameraOptions): void {
    if (this.waitingForTerrain) {
      this.pendingTerrainCamera = { view, options };
      return;
    }
    if (this.terrainTransitionStage) {
      this.pendingTerrainCamera = { view, options };
      return;
    }
    const desiredPitch = this.desiredPitch(options.terrainEnabled);
    if (options.terrainEnabled && Math.abs(this.map.getPitch() - desiredPitch) >= 0.5) {
      this.startTerrainTransition(view, options);
      return;
    }
    const camera: EaseToOptions = { duration: 250 };
    let shouldMove = false;
    if (Math.abs(this.map.getPitch() - desiredPitch) >= 0.5) {
      camera.pitch = desiredPitch;
      camera.duration = 400;
      shouldMove = true;
    }
    const desiredBearing = this.desiredBearing(view, options.headingUp);
    if (this.bearingDifference(this.map.getBearing(), desiredBearing) >= 0.5) {
      camera.bearing = desiredBearing;
      shouldMove = true;
    }
    if (options.autoFollow && view.rider) {
      camera.center = this.position(view.rider) as [number, number];
      shouldMove = true;
      if (this.pendingInitialFollowRoute === view.route) {
        camera.zoom = INITIAL_FOLLOW_ZOOM;
        camera.duration = 0;
        this.pendingInitialFollowRoute = null;
      }
    }
    if (shouldMove) {
      this.map.easeTo(camera);
    }
  }

  notifyTerrainSourceLoaded(): void {
    if (!this.waitingForTerrain || !this.pendingTerrainCamera || !this.terrainEnabled) {
      return;
    }
    if (!this.map.isSourceLoaded(this.terrainSourceId)) {
      return;
    }
    const pendingCamera = this.pendingTerrainCamera;
    this.waitingForTerrain = false;
    this.pendingTerrainCamera = null;
    this.update(pendingCamera.view, pendingCamera.options);
  }

  destroy(): void {
    this.terrainTransitionId += 1;
    this.terrainTransitionStage = null;
    this.waitingForTerrain = false;
    this.pendingTerrainCamera = null;
  }

  private startTerrainTransition(view: RouteMapView, options: MapLibreRouteCameraOptions): void {
    this.terrainTransitionId += 1;
    const transitionId = this.terrainTransitionId;
    this.terrainTransitionStage = 'pitch';
    this.terrainTransitionInitialFollow = false;
    this.pendingTerrainCamera = { view, options };
    if (options.autoFollow && this.pendingInitialFollowRoute === view.route) {
      this.terrainTransitionInitialFollow = true;
      this.pendingInitialFollowRoute = null;
    }
    this.map.stop();
    this.map.once('moveend', () => this.finishTerrainPitch(transitionId));
    this.map.easeTo({ duration: 300, pitch: this.desiredPitch(true) });
  }

  private finishTerrainPitch(transitionId: number): void {
    if (
      transitionId !== this.terrainTransitionId ||
      this.terrainTransitionStage !== 'pitch' ||
      !this.terrainEnabled ||
      !this.pendingTerrainCamera
    ) {
      return;
    }
    const target = this.pendingTerrainCamera;
    this.pendingTerrainCamera = null;
    this.terrainTransitionStage = 'follow';
    const camera: EaseToOptions = { duration: 350, freezeElevation: true };
    if (this.terrainTransitionInitialFollow) {
      camera.zoom = INITIAL_FOLLOW_ZOOM;
    }
    const desiredBearing = this.desiredBearing(target.view, target.options.headingUp);
    if (this.bearingDifference(this.map.getBearing(), desiredBearing) >= 0.5) {
      camera.bearing = desiredBearing;
    }
    if (target.options.autoFollow && target.view.rider) {
      camera.center = this.position(target.view.rider) as [number, number];
    }
    this.map.once('moveend', () => this.finishTerrainFollow(transitionId));
    this.map.easeTo(camera);
  }

  private finishTerrainFollow(transitionId: number): void {
    if (transitionId !== this.terrainTransitionId || this.terrainTransitionStage !== 'follow') {
      return;
    }
    this.terrainTransitionStage = null;
    const pendingCamera = this.pendingTerrainCamera;
    this.pendingTerrainCamera = null;
    if (pendingCamera && this.terrainEnabled) {
      this.update(pendingCamera.view, pendingCamera.options);
    }
  }

  private desiredPitch(terrainEnabled: boolean): number {
    if (terrainEnabled) {
      return 55;
    }
    return 0;
  }

  private desiredBearing(view: RouteMapView, headingUp: boolean): number {
    if (headingUp && view.headingDegrees !== null) {
      return view.headingDegrees;
    }
    return 0;
  }

  private bearingDifference(firstDegrees: number, secondDegrees: number): number {
    const difference = Math.abs(firstDegrees - secondDegrees) % 360;
    return Math.min(difference, 360 - difference);
  }

  private position(coordinate: GeoCoordinate): Position {
    return [coordinate.longitude, coordinate.latitude];
  }
}
