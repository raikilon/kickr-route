import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';
import { RouteMapView } from '../projection/route-map-projection';
import { MapLibreAvailabilityMonitor } from './maplibre-availability-monitor';
import { MapLibreBasemapController, type RouteMapBasemap } from './maplibre-basemap-controller';
import { MapLibreRouteCamera, type MapLibreRouteCameraOptions } from './maplibre-route-camera';
import { MapLibreRouteLayers } from './maplibre-route-layers';

const OPEN_FREE_MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

export type { RouteMapBasemap } from './maplibre-basemap-controller';

export interface RouteMapRenderOptions extends MapLibreRouteCameraOptions {
  readonly basemap: RouteMapBasemap;
  readonly gradientColors: boolean;
}

export class MapLibreRouteRenderer {
  private map!: MapLibreMap;
  private camera!: MapLibreRouteCamera;
  private routeLayers!: MapLibreRouteLayers;
  private basemap!: MapLibreBasemapController;

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
    this.basemap.applyBasemap(options.basemap);
    this.camera.setTerrainEnabled(options.terrainEnabled);
    this.basemap.applyTerrain(options.terrainEnabled);
    this.routeLayers.applyRouteColors(options.gradientColors);
    this.routeLayers.updateRouteData(view);
    this.camera.fitNewRoute(view.route);
    this.camera.update(view, options);
  }

  resize(): void {
    this.map.resize();
  }

  destroy(): void {
    this.camera?.destroy();
    this.routeLayers?.destroy();
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
    this.basemap = new MapLibreBasemapController(this.map);
    this.routeLayers = new MapLibreRouteLayers(this.map, this.maplibre, this.element);
    this.camera = new MapLibreRouteCamera(this.map, this.maplibre, this.basemap.terrainSourceId);
    const availability = new MapLibreAvailabilityMonitor(
      this.map,
      this.reportTileAvailability,
      this.routeLayers.sourceIds,
      this.basemap.terrainSourceId,
      () => this.camera.notifyTerrainSourceLoaded(),
    );
    availability.observe();
    await availability.waitForStyle();
    this.basemap.initialize();
    this.routeLayers.initialize();
    this.map.addControl(new this.maplibre.NavigationControl({ showCompass: false }), 'top-right');
  }
}
