import { GeoCoordinate } from '../../../core/route/geo-coordinate';
import { RouteProcessingPolicy } from '../../../core/route/route-processing-policy';
import { RouteSegment } from '../../../core/route/route-segment';
import { Route } from '../../../core/route/route';
import { MapLibreRouteRenderer } from './maplibre-route-renderer';
import { RouteMapProjection } from '../projection/route-map-projection';

const mapMock = vi.hoisted(() => ({
  nextEvent: 'style.load',
  fitBoundsCalls: 0,
  resizeCalls: 0,
  removed: false,
  workerUrl: '',
  markerUpdates: 0,
  pitch: 0,
  zoom: 0,
  zoomCalls: 0,
  paintProperties: [] as { layerId: string; property: string; value: unknown }[],
}));

vi.mock('maplibre-gl', () => {
  type Listener = (event: { error: Error; sourceId?: string; isSourceLoaded?: boolean }) => void;

  class FakeMap {
    private readonly listeners = new globalThis.Map<string, Set<Listener>>();
    private readonly sources = new globalThis.Map<string, unknown>();
    private readonly layers = new Set<string>();

    constructor(options: {
      style: { sources: Record<string, unknown>; layers: { id: string }[] };
    }) {
      Object.entries(options.style.sources).forEach(([id, source]) => this.sources.set(id, source));
      options.style.layers.forEach((layer) => this.layers.add(layer.id));
      queueMicrotask(() => this.emit(mapMock.nextEvent));
    }

    on(event: string, listener: Listener): void {
      const listeners = this.listeners.get(event) ?? new Set<Listener>();
      listeners.add(listener);
      this.listeners.set(event, listeners);
    }

    once(event: string, listener: Listener): void {
      this.on(event, listener);
    }

    off(event: string, listener: Listener): void {
      this.listeners.get(event)?.delete(listener);
    }

    getStyle(): { layers: { id: string; layout?: { visibility?: 'visible' | 'none' } }[] } {
      return { layers: [...this.layers].map((id) => ({ id })) };
    }

    addSource(id: string, source: { type: string }): void {
      if (source.type === 'geojson') {
        this.sources.set(id, { setData: vi.fn() });
        return;
      }
      this.sources.set(id, source);
    }

    getSource(id: string): unknown {
      return this.sources.get(id);
    }

    addLayer(layer: { id: string }): void {
      this.layers.add(layer.id);
    }

    getLayer(id: string): unknown {
      if (this.layers.has(id)) {
        return { id };
      }
      return undefined;
    }

    readonly setLayoutProperty = vi.fn();
    readonly setTerrain = vi.fn();
    setPaintProperty(layerId: string, property: string, value: unknown): void {
      mapMock.paintProperties.push({ layerId, property, value });
    }
    easeTo(options: { pitch?: number; zoom?: number }): void {
      if (options.pitch !== undefined) {
        mapMock.pitch = options.pitch;
      }
      if (options.zoom !== undefined) {
        mapMock.zoom = options.zoom;
        mapMock.zoomCalls += 1;
      }
    }

    getBearing(): number {
      return 0;
    }

    getPitch(): number {
      return mapMock.pitch;
    }

    getZoom(): number {
      return mapMock.zoom;
    }

    readonly addControl = vi.fn();

    resize(): void {
      mapMock.resizeCalls += 1;
    }

    fitBounds(): void {
      mapMock.fitBoundsCalls += 1;
    }

    remove(): void {
      mapMock.removed = true;
    }

    private emit(event: string): void {
      const payload = { error: new Error('Style failed.') };
      this.listeners.get(event)?.forEach((listener) => listener(payload));
    }
  }

  class FakeMarker {
    setLngLat(): this {
      mapMock.markerUpdates += 1;
      return this;
    }

    addTo(): this {
      return this;
    }

    readonly remove = vi.fn();
  }

  return {
    Map: FakeMap,
    Marker: FakeMarker,
    setWorkerUrl: (url: string) => {
      mapMock.workerUrl = url;
    },
    NavigationControl: class {},
    LngLatBounds: class {
      extend(): this {
        return this;
      }
    },
  };
});

describe('MapLibreRouteRenderer', () => {
  beforeEach(() => {
    mapMock.nextEvent = 'style.load';
    mapMock.fitBoundsCalls = 0;
    mapMock.resizeCalls = 0;
    mapMock.removed = false;
    mapMock.workerUrl = '';
    mapMock.markerUpdates = 0;
    mapMock.pitch = 0;
    mapMock.zoom = 0;
    mapMock.zoomCalls = 0;
    mapMock.paintProperties.length = 0;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      getExtension: () => null,
    } as unknown as WebGL2RenderingContext);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          version: 8,
          sources: { openmaptiles: { type: 'vector' } },
          layers: [{ id: 'background', type: 'background' }],
        }),
      } as Response),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('becomes ready on style load and refits when the route changes', async () => {
    const renderer = await MapLibreRouteRenderer.create(document.createElement('div'), vi.fn());
    const firstRoute = new Route('First route', [
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
    const secondRoute = new Route('Second route', [
      new RouteSegment(
        0,
        0,
        [
          { coordinate: new GeoCoordinate(1, 7), elevationMeters: 500 },
          { coordinate: new GeoCoordinate(1.01, 7.01), elevationMeters: 510 },
        ],
        new RouteProcessingPolicy(0, 100),
      ),
    ]);
    const firstView = new RouteMapProjection(firstRoute, 0, firstRoute.locationAt(0)).project();
    const secondView = new RouteMapProjection(secondRoute, 0, secondRoute.locationAt(0)).project();
    const renderOptions = {
      basemap: 'street' as const,
      terrainEnabled: false,
      headingUp: false,
      autoFollow: true,
      gradientColors: false,
    };

    renderer.render(firstView, renderOptions);
    renderer.render(firstView, renderOptions);
    renderer.render(secondView, renderOptions);
    renderer.render(secondView, { ...renderOptions, terrainEnabled: true });
    renderer.render(secondView, {
      ...renderOptions,
      gradientColors: true,
      terrainEnabled: true,
    });
    renderer.render(secondView, { ...renderOptions, terrainEnabled: true });

    expect(mapMock.fitBoundsCalls).toBe(2);
    expect(mapMock.resizeCalls).toBe(2);
    expect(mapMock.markerUpdates).toBe(6);
    expect(mapMock.pitch).toBe(55);
    expect(mapMock.zoom).toBe(16);
    expect(mapMock.zoomCalls).toBe(3);
    expect(mapMock.paintProperties).toContainEqual({
      layerId: 'kickr-completed-route',
      property: 'line-color',
      value: ['get', 'gradientColor'],
    });
    expect(mapMock.paintProperties).toContainEqual({
      layerId: 'kickr-completed-route',
      property: 'line-opacity',
      value: 0.38,
    });
    expect(mapMock.paintProperties.at(-4)).toEqual({
      layerId: 'kickr-remaining-route',
      property: 'line-color',
      value: '#d7e1e7',
    });
    expect(mapMock.paintProperties.at(-2)).toEqual({
      layerId: 'kickr-completed-route',
      property: 'line-color',
      value: '#beff2a',
    });
    expect(mapMock.workerUrl).toBe(new URL('maplibre-gl-worker.mjs', document.baseURI).toString());
  });

  it('does not override a closer manual zoom or zoom when auto-follow is off', async () => {
    const renderer = await MapLibreRouteRenderer.create(document.createElement('div'), vi.fn());
    const route = new Route('Camera route', [
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
    const view = new RouteMapProjection(route, 0, route.locationAt(0)).project();
    const renderOptions = {
      basemap: 'street' as const,
      terrainEnabled: true,
      headingUp: false,
      autoFollow: true,
      gradientColors: false,
    };

    renderer.render(view, renderOptions);
    expect(mapMock.zoom).toBe(16);
    expect(mapMock.zoomCalls).toBe(1);

    mapMock.zoom = 17;
    renderer.render(view, { ...renderOptions, terrainEnabled: false });
    renderer.render(view, renderOptions);
    expect(mapMock.zoom).toBe(17);
    expect(mapMock.zoomCalls).toBe(1);

    mapMock.zoom = 14;
    renderer.render(view, { ...renderOptions, terrainEnabled: false });
    renderer.render(view, { ...renderOptions, autoFollow: false });
    expect(mapMock.zoom).toBe(14);
    expect(mapMock.zoomCalls).toBe(1);
  });

  it('rejects style initialization errors and removes the map', async () => {
    mapMock.nextEvent = 'error';

    await expect(
      MapLibreRouteRenderer.create(document.createElement('div'), vi.fn()),
    ).rejects.toThrow('Style failed.');
    expect(mapMock.removed).toBe(true);
  });
});
