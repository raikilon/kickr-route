import type { Map as MapLibreMap } from 'maplibre-gl';

const MAPTERHORN_TILEJSON = 'https://tiles.mapterhorn.com/tilejson.json';
const SWISSIMAGE_WMS =
  'https://wms.geo.admin.ch/de/?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ch.swisstopo.images-swissimage&STYLES=&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/jpeg';
const SWISSIMAGE_BOUNDS: [number, number, number, number] = [
  3.329595, 44.074747, 14.278255, 49.200438,
];

const SOURCE_IDS = {
  satellite: 'kickr-satellite',
  terrain: 'kickr-terrain',
} as const;

const LAYER_IDS = {
  satellite: 'kickr-satellite',
  satelliteBuildings: 'kickr-satellite-buildings',
} as const;

export type RouteMapBasemap = 'street' | 'satellite';

export class MapLibreBasemapController {
  readonly terrainSourceId = SOURCE_IDS.terrain;

  private readonly baseLayerVisibility = new Map<string, 'visible' | 'none'>();
  private appliedBasemap: RouteMapBasemap | null = null;
  private terrainEnabled = false;
  private satelliteBuildingsAvailable = false;

  constructor(private readonly map: MapLibreMap) {}

  initialize(): void {
    this.captureBaseLayers();
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

  applyBasemap(basemap: RouteMapBasemap): void {
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

  applyTerrain(enabled: boolean): void {
    if (this.terrainEnabled === enabled) {
      this.updateSatelliteBuildings();
      return;
    }
    this.terrainEnabled = enabled;
    if (enabled) {
      this.map.setTerrain({ source: SOURCE_IDS.terrain, exaggeration: 1 });
      this.updateSatelliteBuildings();
      return;
    }
    this.map.setTerrain(null);
    this.updateSatelliteBuildings();
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

  private setLayerVisibility(layerId: string, visibility: 'visible' | 'none'): void {
    if (!this.map.getLayer(layerId)) {
      return;
    }
    this.map.setLayoutProperty(layerId, 'visibility', visibility);
  }
}
