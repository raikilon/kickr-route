import type { Feature, FeatureCollection, LineString, Point, Position } from 'geojson';
import type {
  EaseToOptions,
  GeoJSONSource,
  Map as MapLibreMap,
  MapLibreEvent,
  Marker as MapLibreMarker,
  StyleSpecification,
} from 'maplibre-gl';
import { GeoCoordinate } from '../../../core/route/geo-coordinate';
import { Route } from '../../../core/route/route';
import { RouteMapPath, RouteMapView } from '../projection/route-map-projection';

const OPEN_FREE_MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const MAPTERHORN_TILEJSON = 'https://tiles.mapterhorn.com/tilejson.json';
const SWISSIMAGE_WMS =
  'https://wms.geo.admin.ch/de/?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ch.swisstopo.images-swissimage&STYLES=&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/jpeg';
const SWISSIMAGE_BOUNDS: [number, number, number, number] = [
  3.329595, 44.074747, 14.278255, 49.200438,
];
const INITIAL_FOLLOW_ZOOM = 15;
const REMAINING_ROUTE_COLOR = '#d7e1e7';

const SOURCE_IDS = {
  satellite: 'kickr-satellite',
  terrain: 'kickr-terrain',
  completed: 'kickr-completed-route',
  remaining: 'kickr-remaining-route',
  points: 'kickr-route-points',
} as const;

const LAYER_IDS = {
  satellite: 'kickr-satellite',
  satelliteBuildings: 'kickr-satellite-buildings',
  remainingCasing: 'kickr-remaining-route-casing',
  remaining: 'kickr-remaining-route',
  completedCasing: 'kickr-completed-route-casing',
  completed: 'kickr-completed-route',
  points: 'kickr-route-points',
} as const;

export type RouteMapBasemap = 'street' | 'satellite';

export interface RouteMapRenderOptions {
  readonly basemap: RouteMapBasemap;
  readonly terrainEnabled: boolean;
  readonly headingUp: boolean;
  readonly autoFollow: boolean;
  readonly gradientColors: boolean;
}

export class MapLibreRouteRenderer {
  private readonly baseLayerVisibility = new Map<string, 'visible' | 'none'>();
  private map!: MapLibreMap;
  private lastFittedRoute: Route | null = null;
  private pendingInitialFollowRoute: Route | null = null;
  private appliedBasemap: RouteMapBasemap | null = null;
  private terrainEnabled = false;
  private gradientColorsEnabled = false;
  private satelliteBuildingsAvailable = false;
  private riderMarker: MapLibreMarker | null = null;
  private waitingForTerrain = false;
  private terrainTransitionId = 0;
  private terrainTransitionStage: 'pitch' | 'follow' | null = null;
  private terrainTransitionInitialFollow = false;
  private pendingTerrainCamera: {
    readonly view: RouteMapView;
    readonly options: RouteMapRenderOptions;
  } | null = null;

  private constructor(
    private readonly maplibre: typeof import('maplibre-gl'),
    private readonly element: HTMLDivElement,
    private readonly reportTileAvailability: (available: boolean) => void,
    private readonly streetStyle: StyleSpecification,
  ) {}

  static async create(
    element: HTMLDivElement,
    reportTileAvailability: (available: boolean) => void,
  ): Promise<MapLibreRouteRenderer> {
    this.requireWebGl2(element);
    const maplibre = await import('maplibre-gl');
    maplibre.setWorkerUrl(
      new URL('maplibre-gl-worker.mjs', element.ownerDocument.baseURI).toString(),
    );
    const streetStyle = await this.loadStreetStyle(reportTileAvailability);
    const renderer = new MapLibreRouteRenderer(
      maplibre,
      element,
      reportTileAvailability,
      streetStyle,
    );
    try {
      await renderer.initialize();
      return renderer;
    } catch (error) {
      renderer.destroy();
      throw error;
    }
  }

  render(view: RouteMapView, options: RouteMapRenderOptions): void {
    this.applyBasemap(options.basemap);
    this.applyTerrain(options.terrainEnabled);
    this.applyRouteColors(options.gradientColors);
    this.updateRouteData(view);
    this.fitNewRoute(view.route);
    this.updateCamera(view, options);
  }

  resize(): void {
    this.map.resize();
  }

  destroy(): void {
    this.terrainTransitionId += 1;
    this.terrainTransitionStage = null;
    this.waitingForTerrain = false;
    this.pendingTerrainCamera = null;
    this.riderMarker?.remove();
    this.map?.remove();
  }

  private static requireWebGl2(element: HTMLDivElement): void {
    const canvas = element.ownerDocument.createElement('canvas');
    const context = canvas.getContext('webgl2');
    if (!context) {
      throw new Error('The route map requires WebGL 2. Enable browser hardware acceleration.');
    }
    context.getExtension('WEBGL_lose_context')?.loseContext();
  }

  private static async loadStreetStyle(
    reportTileAvailability: (available: boolean) => void,
  ): Promise<StyleSpecification> {
    try {
      const response = await fetch(OPEN_FREE_MAP_STYLE);
      if (!response.ok) {
        throw new Error(`OpenFreeMap returned HTTP ${response.status}.`);
      }
      reportTileAvailability(true);
      return (await response.json()) as StyleSpecification;
    } catch {
      reportTileAvailability(false);
      return this.fallbackStyle();
    }
  }

  private static fallbackStyle(): StyleSpecification {
    return {
      version: 8,
      sources: {},
      layers: [
        {
          id: 'offline-background',
          type: 'background',
          paint: { 'background-color': '#172027' },
        },
      ],
    };
  }

  private async initialize(): Promise<void> {
    this.map = new this.maplibre.Map({
      container: this.element,
      style: this.streetStyle,
      center: [0, 0],
      zoom: 2,
      maxZoom: 19,
      maxPitch: 70,
      scrollZoom: { around: 'center' },
      touchZoomRotate: { around: 'center' },
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: { compact: true },
    });
    this.observeAvailability();
    await this.waitForStyle();
    this.captureBaseLayers();
    this.addEnvironmentSources();
    this.addRouteSourcesAndLayers();
    this.map.addControl(new this.maplibre.NavigationControl({ showCompass: false }), 'top-right');
  }

  private waitForStyle(): Promise<void> {
    return new Promise((resolve, reject) => {
      const handleError = (event: MapLibreEvent & { error: Error }): void => {
        this.map.off('style.load', handleStyleLoad);
        reject(event.error);
      };
      const handleStyleLoad = (): void => {
        this.map.off('error', handleError);
        resolve();
      };
      this.map.once('error', handleError);
      this.map.once('style.load', handleStyleLoad);
    });
  }

  private observeAvailability(): void {
    this.map.on('error', () => this.reportTileAvailability(false));
    this.map.on('sourcedata', (event) => this.reportLoadedSource(event));
  }

  private reportLoadedSource(
    event: MapLibreEvent & { sourceId?: string; isSourceLoaded?: boolean; tile?: unknown },
  ): void {
    if (!event.sourceId || !event.isSourceLoaded) {
      return;
    }
    if (
      event.sourceId === SOURCE_IDS.completed ||
      event.sourceId === SOURCE_IDS.remaining ||
      event.sourceId === SOURCE_IDS.points
    ) {
      return;
    }
    this.reportTileAvailability(true);
    if (event.sourceId === SOURCE_IDS.terrain && event.tile) {
      queueMicrotask(() => this.resumeTerrainCamera());
    }
  }

  private captureBaseLayers(): void {
    for (const layer of this.map.getStyle().layers) {
      let visibility: 'visible' | 'none' = 'visible';
      if (layer.layout?.visibility === 'none') {
        visibility = 'none';
      }
      this.baseLayerVisibility.set(layer.id, visibility);
    }
  }

  private addEnvironmentSources(): void {
    this.map.addSource(SOURCE_IDS.satellite, {
      type: 'raster',
      tiles: [SWISSIMAGE_WMS],
      tileSize: 256,
      bounds: SWISSIMAGE_BOUNDS,
      attribution: '<a href="https://www.geo.admin.ch/">&copy; Data: swisstopo</a>',
    });
    this.map.addLayer({
      id: LAYER_IDS.satellite,
      type: 'raster',
      source: SOURCE_IDS.satellite,
      layout: { visibility: 'none' },
    });
    this.map.addSource(SOURCE_IDS.terrain, {
      type: 'raster-dem',
      url: MAPTERHORN_TILEJSON,
      encoding: 'terrarium',
      tileSize: 512,
    });
    this.addSatelliteBuildings();
  }

  private addSatelliteBuildings(): void {
    if (!this.map.getSource('openmaptiles')) {
      return;
    }
    this.map.addLayer({
      id: LAYER_IDS.satelliteBuildings,
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 14,
      layout: { visibility: 'none' },
      paint: {
        'fill-extrusion-base': ['get', 'render_min_height'],
        'fill-extrusion-color': '#d7ddd8',
        'fill-extrusion-height': ['get', 'render_height'],
        'fill-extrusion-opacity': 0.72,
      },
    });
    this.satelliteBuildingsAvailable = true;
  }

  private addRouteSourcesAndLayers(): void {
    this.map.addSource(SOURCE_IDS.remaining, {
      type: 'geojson',
      data: this.emptyFeatureCollection(),
    });
    this.map.addSource(SOURCE_IDS.completed, {
      type: 'geojson',
      data: this.emptyFeatureCollection(),
    });
    this.map.addSource(SOURCE_IDS.points, {
      type: 'geojson',
      data: this.emptyFeatureCollection(),
    });
    this.addRouteLayers();
  }

  private addRouteLayers(): void {
    this.map.addLayer({
      id: LAYER_IDS.remainingCasing,
      type: 'line',
      source: SOURCE_IDS.remaining,
      paint: { 'line-color': '#071319', 'line-width': 9, 'line-opacity': 0.82 },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    });
    this.map.addLayer({
      id: LAYER_IDS.remaining,
      type: 'line',
      source: SOURCE_IDS.remaining,
      paint: { 'line-color': REMAINING_ROUTE_COLOR, 'line-width': 5, 'line-opacity': 1 },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    });
    this.map.addLayer({
      id: LAYER_IDS.completedCasing,
      type: 'line',
      source: SOURCE_IDS.completed,
      paint: { 'line-color': '#071319', 'line-width': 10, 'line-opacity': 0.88 },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    });
    this.map.addLayer({
      id: LAYER_IDS.completed,
      type: 'line',
      source: SOURCE_IDS.completed,
      paint: { 'line-color': '#beff2a', 'line-width': 6, 'line-opacity': 1 },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    });
    this.addPointLayer();
  }

  private addPointLayer(): void {
    this.map.addLayer({
      id: LAYER_IDS.points,
      type: 'circle',
      source: SOURCE_IDS.points,
      paint: {
        'circle-radius': 7,
        'circle-color': ['match', ['get', 'kind'], 'start', '#beff2a', '#111c24'],
        'circle-stroke-color': ['match', ['get', 'kind'], 'start', '#08100d', '#ffffff'],
        'circle-stroke-width': 3,
      },
    });
  }

  private applyBasemap(basemap: RouteMapBasemap): void {
    if (this.appliedBasemap === basemap) {
      return;
    }
    this.appliedBasemap = basemap;
    if (basemap === 'street') {
      this.restoreStreetLayers();
      this.setLayerVisibility(LAYER_IDS.satellite, 'none');
      this.updateSatelliteBuildings();
      return;
    }
    this.hideStreetLayers();
    this.setLayerVisibility(LAYER_IDS.satellite, 'visible');
    this.updateSatelliteBuildings();
  }

  private restoreStreetLayers(): void {
    for (const [layerId, visibility] of this.baseLayerVisibility) {
      this.setLayerVisibility(layerId, visibility);
    }
  }

  private hideStreetLayers(): void {
    for (const layerId of this.baseLayerVisibility.keys()) {
      this.setLayerVisibility(layerId, 'none');
    }
  }

  private applyTerrain(enabled: boolean): void {
    if (this.terrainEnabled === enabled) {
      this.updateSatelliteBuildings();
      return;
    }
    this.terrainEnabled = enabled;
    this.terrainTransitionId += 1;
    this.terrainTransitionStage = null;
    this.pendingTerrainCamera = null;
    if (enabled) {
      this.waitingForTerrain = true;
      this.map.setTerrain({ source: SOURCE_IDS.terrain, exaggeration: 1 });
      this.updateSatelliteBuildings();
      return;
    }
    this.waitingForTerrain = false;
    this.map.setTerrain(null);
    this.updateSatelliteBuildings();
  }

  private updateSatelliteBuildings(): void {
    if (!this.satelliteBuildingsAvailable) {
      return;
    }
    let visibility: 'visible' | 'none' = 'none';
    if (this.appliedBasemap === 'satellite' && this.terrainEnabled) {
      visibility = 'visible';
    }
    this.setLayerVisibility(LAYER_IDS.satelliteBuildings, visibility);
  }

  private applyRouteColors(enabled: boolean): void {
    if (this.gradientColorsEnabled === enabled) {
      return;
    }
    this.gradientColorsEnabled = enabled;
    if (enabled) {
      this.map.setPaintProperty(LAYER_IDS.remaining, 'line-color', ['get', 'gradientColor']);
      this.map.setPaintProperty(LAYER_IDS.remaining, 'line-opacity', 1);
      this.map.setPaintProperty(LAYER_IDS.completed, 'line-color', ['get', 'gradientColor']);
      this.map.setPaintProperty(LAYER_IDS.completed, 'line-opacity', 0.38);
      return;
    }
    this.map.setPaintProperty(LAYER_IDS.remaining, 'line-color', REMAINING_ROUTE_COLOR);
    this.map.setPaintProperty(LAYER_IDS.remaining, 'line-opacity', 1);
    this.map.setPaintProperty(LAYER_IDS.completed, 'line-color', '#beff2a');
    this.map.setPaintProperty(LAYER_IDS.completed, 'line-opacity', 1);
  }

  private setLayerVisibility(layerId: string, visibility: 'visible' | 'none'): void {
    if (!this.map.getLayer(layerId)) {
      return;
    }
    this.map.setLayoutProperty(layerId, 'visibility', visibility);
  }

  private updateRouteData(view: RouteMapView): void {
    this.setSourceData(SOURCE_IDS.remaining, this.lineFeatureCollection(view.remainingPaths));
    this.setSourceData(SOURCE_IDS.completed, this.lineFeatureCollection(view.completedPaths));
    this.setSourceData(SOURCE_IDS.points, this.pointFeatureCollection(view));
    this.updateRiderMarker(view.rider);
  }

  private setSourceData(sourceId: string, data: FeatureCollection): void {
    const source = this.map.getSource(sourceId) as GeoJSONSource | undefined;
    source?.setData(data);
  }

  private lineFeatureCollection(paths: readonly RouteMapPath[]): FeatureCollection<LineString> {
    return {
      type: 'FeatureCollection',
      features: paths.map((path) => ({
        type: 'Feature',
        properties: { gradientColor: path.gradientColor },
        geometry: {
          type: 'LineString',
          coordinates: path.coordinates.map((coordinate) => this.position(coordinate)),
        },
      })),
    };
  }

  private pointFeatureCollection(view: RouteMapView): FeatureCollection<Point> {
    return {
      type: 'FeatureCollection',
      features: [this.pointFeature(view.start, 'start'), this.pointFeature(view.finish, 'finish')],
    };
  }

  private updateRiderMarker(coordinate: GeoCoordinate | null): void {
    if (!coordinate) {
      this.riderMarker?.remove();
      this.riderMarker = null;
      return;
    }
    const position = this.position(coordinate) as [number, number];
    if (this.riderMarker) {
      this.riderMarker.setLngLat(position);
      return;
    }
    const element = this.element.ownerDocument.createElement('img');
    element.className = 'route-rider-marker';
    element.src = new URL('bike-marker.svg', this.element.ownerDocument.baseURI).toString();
    element.alt = 'Current rider position';
    element.draggable = false;
    this.riderMarker = new this.maplibre.Marker({
      element,
      anchor: 'center',
      opacityWhenCovered: 1,
    })
      .setLngLat(position)
      .addTo(this.map);
  }

  private pointFeature(coordinate: GeoCoordinate, kind: string): Feature<Point> {
    return {
      type: 'Feature',
      properties: { kind },
      geometry: { type: 'Point', coordinates: this.position(coordinate) },
    };
  }

  private emptyFeatureCollection<T extends LineString | Point>(): FeatureCollection<T> {
    return { type: 'FeatureCollection', features: [] };
  }

  private position(coordinate: GeoCoordinate): Position {
    return [coordinate.longitude, coordinate.latitude];
  }

  private fitNewRoute(route: Route): void {
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

  private updateCamera(view: RouteMapView, options: RouteMapRenderOptions): void {
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

  private startTerrainTransition(view: RouteMapView, options: RouteMapRenderOptions): void {
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
      this.updateCamera(pendingCamera.view, pendingCamera.options);
    }
  }

  private resumeTerrainCamera(): void {
    if (!this.waitingForTerrain || !this.pendingTerrainCamera || !this.terrainEnabled) {
      return;
    }
    if (!this.map.isSourceLoaded(SOURCE_IDS.terrain)) {
      return;
    }
    const pendingCamera = this.pendingTerrainCamera;
    this.waitingForTerrain = false;
    this.pendingTerrainCamera = null;
    this.updateCamera(pendingCamera.view, pendingCamera.options);
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
}
