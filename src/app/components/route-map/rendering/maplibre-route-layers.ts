import type { Feature, FeatureCollection, LineString, Point, Position } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl';
import { GeoCoordinate } from '../../../core/route/geo-coordinate';
import { RouteMapPath, RouteMapView } from '../projection/route-map-projection';

const REMAINING_ROUTE_COLOR = '#d7e1e7';

const SOURCE_IDS = {
  completed: 'kickr-completed-route',
  remaining: 'kickr-remaining-route',
  points: 'kickr-route-points',
} as const;

const LAYER_IDS = {
  remainingCasing: 'kickr-remaining-route-casing',
  remaining: 'kickr-remaining-route',
  completedCasing: 'kickr-completed-route-casing',
  completed: 'kickr-completed-route',
  points: 'kickr-route-points',
} as const;

export class MapLibreRouteLayers {
  readonly sourceIds: readonly string[] = [
    SOURCE_IDS.completed,
    SOURCE_IDS.remaining,
    SOURCE_IDS.points,
  ];

  private gradientColorsEnabled = false;
  private riderMarker: MapLibreMarker | null = null;

  constructor(
    private readonly map: MapLibreMap,
    private readonly maplibre: typeof import('maplibre-gl'),
    private readonly element: HTMLDivElement,
  ) {}

  initialize(): void {
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

  applyRouteColors(enabled: boolean): void {
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

  updateRouteData(view: RouteMapView): void {
    this.setSourceData(SOURCE_IDS.remaining, this.lineFeatureCollection(view.remainingPaths));
    this.setSourceData(SOURCE_IDS.completed, this.lineFeatureCollection(view.completedPaths));
    this.setSourceData(SOURCE_IDS.points, this.pointFeatureCollection(view));
    this.updateRiderMarker(view.rider);
  }

  destroy(): void {
    this.riderMarker?.remove();
    this.riderMarker = null;
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
}
