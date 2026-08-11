import { GeoCoordinate } from '../../../core/route/geo-coordinate';
import { RouteProcessingPolicy } from '../../../core/route/route-processing-policy';
import { RouteSegment } from '../../../core/route/route-segment';
import { Route } from '../../../core/route/route';
import { RouteMapProjection } from '../projection/route-map-projection';
import { MapLibreRouteRenderer } from './maplibre-route-renderer';

const mapState = vi.hoisted(() => ({
  nextEvent: 'style.load',
  options: null as Record<string, unknown> | null,
  workerUrl: '',
  fitBoundsCalls: 0,
  resizeCalls: 0,
  markerUpdates: 0,
  cameraUpdates: [] as Record<string, unknown>[],
  removed: false,
  addedControl: false,
  styleLayerIds: [] as string[],
  map: null as {
    emit(
      event: string,
      payload?: {
        error: Error;
        sourceId?: string;
        isSourceLoaded?: boolean;
        tile?: unknown;
      },
    ): void;
    emitMoveEnd(): void;
    sourceLoaded: boolean;
  } | null,
}));

vi.mock('maplibre-gl', () => {
  type Listener = (event: {
    error: Error;
    sourceId?: string;
    isSourceLoaded?: boolean;
    tile?: unknown;
  }) => void;

  class FakeMap {
    private readonly listeners = new globalThis.Map<string, Set<Listener>>();
    private readonly sources = new globalThis.Map<string, unknown>();
    private readonly layers = new Set<string>();
    sourceLoaded = true;

    constructor(
      options: Record<string, unknown> & {
        style: { sources: Record<string, unknown>; layers: { id: string }[] };
      },
    ) {
      mapState.options = options;
      mapState.map = this;
      Object.entries(options.style.sources).forEach(([id, source]) => this.sources.set(id, source));
      options.style.layers.forEach((layer) => this.layers.add(layer.id));
      mapState.styleLayerIds = options.style.layers.map((layer) => layer.id);
      queueMicrotask(() => this.emit(mapState.nextEvent));
    }

    on(event: string, listener: Listener): void {
      const listeners = this.listeners.get(event) ?? new Set<Listener>();
      listeners.add(listener);
      this.listeners.set(event, listeners);
    }

    once(event: string, listener: Listener): void {
      const onceListener: Listener = (payload) => {
        this.off(event, onceListener);
        listener(payload);
      };
      this.on(event, onceListener);
    }

    off(event: string, listener: Listener): void {
      this.listeners.get(event)?.delete(listener);
    }

    getStyle(): { layers: { id: string }[] } {
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
    readonly setPaintProperty = vi.fn();
    easeTo(options: Record<string, unknown>): void {
      mapState.cameraUpdates.push(options);
    }
    readonly stop = vi.fn();

    getBearing(): number {
      return 0;
    }

    getPitch(): number {
      return 0;
    }

    isSourceLoaded(): boolean {
      return this.sourceLoaded;
    }

    addControl(): void {
      mapState.addedControl = true;
    }

    resize(): void {
      mapState.resizeCalls += 1;
    }

    fitBounds(): void {
      mapState.fitBoundsCalls += 1;
    }

    remove(): void {
      mapState.removed = true;
    }

    emitMoveEnd(): void {
      this.emit('moveend');
    }

    emit(event: string, payload: { error: Error } = { error: new Error('Style failed.') }): void {
      this.listeners.get(event)?.forEach((listener) => listener(payload));
    }
  }

  class FakeMarker {
    setLngLat(): this {
      mapState.markerUpdates += 1;
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
      mapState.workerUrl = url;
    },
    NavigationControl: class {},
    LngLatBounds: class {
      extend(): this {
        return this;
      }
    },
  };
});

class RendererFixture {
  readonly reportAvailability = vi.fn();

  view() {
    const route = new Route('Integration route', [
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
    return new RouteMapProjection(route, 0, route.locationAt(0)).project();
  }
}

describe('MapLibreRouteRenderer integration', () => {
  beforeEach(() => {
    mapState.nextEvent = 'style.load';
    mapState.options = null;
    mapState.workerUrl = '';
    mapState.fitBoundsCalls = 0;
    mapState.resizeCalls = 0;
    mapState.markerUpdates = 0;
    mapState.cameraUpdates.length = 0;
    mapState.removed = false;
    mapState.addedControl = false;
    mapState.styleLayerIds.length = 0;
    mapState.map = null;
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

  it('bootstraps MapLibre and orchestrates rendering and lifecycle methods', async () => {
    const fixture = new RendererFixture();
    const renderer = await MapLibreRouteRenderer.create(
      document.createElement('div'),
      fixture.reportAvailability,
    );
    const view = fixture.view();

    renderer.render(view, {
      basemap: 'street',
      terrainEnabled: false,
      headingUp: false,
      autoFollow: true,
      gradientColors: false,
    });
    renderer.render(view, {
      basemap: 'street',
      terrainEnabled: false,
      headingUp: false,
      autoFollow: true,
      gradientColors: false,
    });
    renderer.resize();
    renderer.destroy();

    expect(mapState.workerUrl).toBe(new URL('maplibre-gl-worker.mjs', document.baseURI).toString());
    expect(mapState.options).toEqual(
      expect.objectContaining({
        center: [0, 0],
        zoom: 2,
        maxZoom: 19,
        maxPitch: 70,
        dragRotate: false,
        pitchWithRotate: false,
      }),
    );
    expect(fixture.reportAvailability).toHaveBeenCalledWith(true);
    expect(mapState.addedControl).toBe(true);
    expect(mapState.fitBoundsCalls).toBe(1);
    expect(mapState.resizeCalls).toBe(2);
    expect(mapState.markerUpdates).toBe(2);
    expect(mapState.removed).toBe(true);
  });

  it('uses the offline style and reports unavailable when street style loading fails', async () => {
    const fixture = new RendererFixture();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline.')));

    const renderer = await MapLibreRouteRenderer.create(
      document.createElement('div'),
      fixture.reportAvailability,
    );

    expect(fixture.reportAvailability).toHaveBeenCalledWith(false);
    expect(mapState.styleLayerIds).toEqual(['offline-background']);
    renderer.destroy();
  });

  it('forwards loaded terrain events into the two-stage camera transition', async () => {
    const renderer = await MapLibreRouteRenderer.create(document.createElement('div'), vi.fn());
    const view = new RendererFixture().view();
    const map = mapState.map!;
    map.sourceLoaded = false;

    renderer.render(view, {
      basemap: 'satellite',
      terrainEnabled: true,
      headingUp: false,
      autoFollow: true,
      gradientColors: true,
    });
    expect(mapState.cameraUpdates).toEqual([]);

    map.sourceLoaded = true;
    map.emit('sourcedata', {
      error: new Error('unused'),
      sourceId: 'kickr-terrain',
      isSourceLoaded: true,
      tile: {},
    });
    await Promise.resolve();
    expect(mapState.cameraUpdates.at(-1)).toEqual({ duration: 300, pitch: 55 });

    map.emitMoveEnd();
    expect(mapState.cameraUpdates.at(-1)).toEqual(
      expect.objectContaining({
        center: [7, 0],
        duration: 350,
        freezeElevation: true,
        zoom: 15,
      }),
    );
    map.emitMoveEnd();

    renderer.destroy();
  });

  it('rejects style initialization errors and removes the map', async () => {
    mapState.nextEvent = 'error';

    await expect(
      MapLibreRouteRenderer.create(document.createElement('div'), vi.fn()),
    ).rejects.toThrow('Style failed.');
    expect(mapState.removed).toBe(true);
  });
});
