import type { FeatureCollection } from 'geojson';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { GeoCoordinate } from '../../../core/route/geo-coordinate';
import { RouteProcessingPolicy } from '../../../core/route/route-processing-policy';
import { RouteSegment } from '../../../core/route/route-segment';
import { Route } from '../../../core/route/route';
import { RouteMapProjection } from '../projection/route-map-projection';
import { MapLibreRouteLayers } from './maplibre-route-layers';

class FakeRouteLayersMap {
  readonly layers: { id: string; source: string; paint?: unknown }[] = [];
  readonly paintProperties: { layerId: string; property: string; value: unknown }[] = [];
  readonly sourceData = new Map<string, FeatureCollection>();
  private readonly sources = new Map<string, { setData: (data: FeatureCollection) => void }>();

  addSource(id: string): void {
    this.sources.set(id, {
      setData: (data) => this.sourceData.set(id, data),
    });
  }

  getSource(id: string): unknown {
    return this.sources.get(id);
  }

  addLayer(layer: { id: string; source: string; paint?: unknown }): void {
    this.layers.push(layer);
  }

  setPaintProperty(layerId: string, property: string, value: unknown): void {
    this.paintProperties.push({ layerId, property, value });
  }
}

class FakeRouteMarker {
  static instances: FakeRouteMarker[] = [];

  readonly remove = vi.fn();
  readonly positions: [number, number][] = [];

  constructor(readonly options: { element: HTMLImageElement }) {
    FakeRouteMarker.instances.push(this);
  }

  setLngLat(position: [number, number]): this {
    this.positions.push(position);
    return this;
  }

  addTo(): this {
    return this;
  }
}

class RouteLayersFixture {
  readonly map = new FakeRouteLayersMap();
  readonly element = document.createElement('div');
  readonly layers = new MapLibreRouteLayers(
    this.map as unknown as MapLibreMap,
    { Marker: FakeRouteMarker } as unknown as typeof import('maplibre-gl'),
    this.element,
  );

  view(distanceAtFinish = false) {
    const route = new Route('Layer route', [
      new RouteSegment(
        0,
        0,
        [
          { coordinate: new GeoCoordinate(0, 7), elevationMeters: 500 },
          { coordinate: new GeoCoordinate(0.01, 7.01), elevationMeters: 510 },
        ],
        new RouteProcessingPolicy(0, 100),
      ),
    ]);
    let distanceMeters = 0;
    if (distanceAtFinish) {
      distanceMeters = route.totalDistanceMeters;
    }
    return new RouteMapProjection(
      route,
      distanceMeters,
      route.locationAt(distanceMeters),
    ).project();
  }
}

describe('MapLibreRouteLayers', () => {
  beforeEach(() => {
    FakeRouteMarker.instances.length = 0;
  });

  it('creates ordered route and point sources and layers', () => {
    const fixture = new RouteLayersFixture();

    fixture.layers.initialize();

    expect(fixture.layers.sourceIds).toEqual([
      'kickr-completed-route',
      'kickr-remaining-route',
      'kickr-route-points',
    ]);
    expect(fixture.map.layers.map((layer) => layer.id)).toEqual([
      'kickr-remaining-route-casing',
      'kickr-remaining-route',
      'kickr-completed-route-casing',
      'kickr-completed-route',
      'kickr-route-points',
    ]);
  });

  it('publishes gradient properties and start/finish point data', () => {
    const fixture = new RouteLayersFixture();
    fixture.layers.initialize();
    const view = fixture.view();

    fixture.layers.updateRouteData(view);

    const remaining = fixture.map.sourceData.get('kickr-remaining-route');
    expect(remaining?.features[0].properties).toHaveProperty('gradientColor');
    expect(remaining?.features[0].geometry).toEqual({
      type: 'LineString',
      coordinates: [
        [7, 0],
        [7.01, 0.01],
      ],
    });
    const points = fixture.map.sourceData.get('kickr-route-points');
    expect(points?.features.map((feature) => feature.properties?.['kind'])).toEqual([
      'start',
      'finish',
    ]);
  });

  it('switches both route layers between gradient and standard colors', () => {
    const fixture = new RouteLayersFixture();
    fixture.layers.initialize();

    fixture.layers.applyRouteColors(true);
    fixture.layers.applyRouteColors(false);

    expect(fixture.map.paintProperties).toContainEqual({
      layerId: 'kickr-completed-route',
      property: 'line-opacity',
      value: 0.38,
    });
    expect(fixture.map.paintProperties.at(-4)).toEqual({
      layerId: 'kickr-remaining-route',
      property: 'line-color',
      value: '#d7e1e7',
    });
    expect(fixture.map.paintProperties.at(-2)).toEqual({
      layerId: 'kickr-completed-route',
      property: 'line-color',
      value: '#beff2a',
    });
  });

  it('creates, updates, removes, and destroys the rider marker', () => {
    const fixture = new RouteLayersFixture();
    fixture.layers.initialize();
    const startView = fixture.view();
    const finishView = fixture.view(true);

    fixture.layers.updateRouteData(startView);
    fixture.layers.updateRouteData(finishView);

    const marker = FakeRouteMarker.instances[0];
    expect(FakeRouteMarker.instances).toHaveLength(1);
    expect(marker.positions).toEqual([
      [7, 0],
      [7.01, 0.01],
    ]);
    expect(marker.options.element.className).toBe('route-rider-marker');
    expect(marker.options.element.src).toBe(
      new URL('bike-marker.svg', document.baseURI).toString(),
    );
    expect(marker.options.element.alt).toBe('Current rider position');

    fixture.layers.updateRouteData({ ...finishView, rider: null });
    expect(marker.remove).toHaveBeenCalledTimes(1);
    fixture.layers.updateRouteData(startView);
    fixture.layers.destroy();
    expect(FakeRouteMarker.instances[1].remove).toHaveBeenCalledTimes(1);
  });
});
