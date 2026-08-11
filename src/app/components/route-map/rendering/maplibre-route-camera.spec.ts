import type { EaseToOptions, Map as MapLibreMap } from 'maplibre-gl';
import { GeoCoordinate } from '../../../core/route/geo-coordinate';
import { RouteProcessingPolicy } from '../../../core/route/route-processing-policy';
import { RouteSegment } from '../../../core/route/route-segment';
import { Route } from '../../../core/route/route';
import { RouteMapProjection, RouteMapView } from '../projection/route-map-projection';
import { MapLibreRouteCamera, MapLibreRouteCameraOptions } from './maplibre-route-camera';

class FakeCameraMap {
  readonly cameraUpdates: EaseToOptions[] = [];
  readonly fitBounds = vi.fn();
  readonly resize = vi.fn();
  readonly stop = vi.fn();
  bearing = 0;
  pitch = 0;
  sourceLoaded = true;
  zoom = 0;
  zoomCalls = 0;

  private readonly moveEndListeners: (() => void)[] = [];

  easeTo(options: EaseToOptions): void {
    this.cameraUpdates.push(options);
    if (options.bearing !== undefined) {
      this.bearing = options.bearing;
    }
    if (options.pitch !== undefined) {
      this.pitch = options.pitch;
    }
    if (options.zoom !== undefined) {
      this.zoom = options.zoom;
      this.zoomCalls += 1;
    }
  }

  getBearing(): number {
    return this.bearing;
  }

  getPitch(): number {
    return this.pitch;
  }

  isSourceLoaded(): boolean {
    return this.sourceLoaded;
  }

  once(event: string, listener: () => void): void {
    if (event === 'moveend') {
      this.moveEndListeners.push(listener);
    }
  }

  emitMoveEnd(): void {
    this.moveEndListeners.shift()?.();
  }
}

class CameraFixture {
  readonly map = new FakeCameraMap();
  readonly camera = new MapLibreRouteCamera(
    this.map as unknown as MapLibreMap,
    {
      LngLatBounds: class {
        extend(): this {
          return this;
        }
      },
    } as unknown as typeof import('maplibre-gl'),
    'kickr-terrain',
  );

  readonly options: MapLibreRouteCameraOptions = {
    terrainEnabled: false,
    headingUp: false,
    autoFollow: true,
  };

  route(name = 'Camera route', offset = 0): Route {
    return new Route(name, [
      new RouteSegment(
        0,
        0,
        [
          { coordinate: new GeoCoordinate(offset, 7 + offset), elevationMeters: 500 },
          {
            coordinate: new GeoCoordinate(offset + 0.01, 7.01 + offset),
            elevationMeters: 510,
          },
        ],
        new RouteProcessingPolicy(0, 100),
      ),
    ]);
  }

  view(route: Route, atFinish = false): RouteMapView {
    let distanceMeters = 0;
    if (atFinish) {
      distanceMeters = route.totalDistanceMeters;
    }
    return new RouteMapProjection(
      route,
      distanceMeters,
      route.locationAt(distanceMeters),
    ).project();
  }
}

describe('MapLibreRouteCamera', () => {
  it('fits each route once and only applies the initial follow zoom once per route', () => {
    const fixture = new CameraFixture();
    const firstRoute = fixture.route();
    const firstView = fixture.view(firstRoute);

    fixture.camera.fitNewRoute(firstRoute);
    fixture.camera.fitNewRoute(firstRoute);
    fixture.camera.update(firstView, fixture.options);

    expect(fixture.map.fitBounds).toHaveBeenCalledTimes(1);
    expect(fixture.map.resize).toHaveBeenCalledTimes(1);
    expect(fixture.map.cameraUpdates.at(-1)).toEqual(
      expect.objectContaining({ center: [7, 0], duration: 0, zoom: 15 }),
    );

    fixture.map.zoom = 17;
    fixture.camera.update(firstView, fixture.options);
    expect(fixture.map.zoom).toBe(17);
    expect(fixture.map.zoomCalls).toBe(1);

    const secondRoute = fixture.route('Second route', 1);
    fixture.camera.fitNewRoute(secondRoute);
    fixture.camera.update(fixture.view(secondRoute), fixture.options);
    expect(fixture.map.fitBounds).toHaveBeenCalledTimes(2);
    expect(fixture.map.zoomCalls).toBe(2);
  });

  it('waits for fully loaded terrain and uses the latest view in the two-stage transition', () => {
    const fixture = new CameraFixture();
    const route = fixture.route();
    const startView = fixture.view(route);
    const finishView = fixture.view(route, true);
    const terrainOptions = { ...fixture.options, terrainEnabled: true };
    fixture.camera.fitNewRoute(route);
    fixture.map.zoom = 17;
    fixture.map.sourceLoaded = false;

    fixture.camera.setTerrainEnabled(true);
    fixture.camera.update(startView, terrainOptions);
    fixture.camera.update(finishView, terrainOptions);
    fixture.camera.notifyTerrainSourceLoaded();
    expect(fixture.map.cameraUpdates).toHaveLength(0);

    fixture.map.sourceLoaded = true;
    fixture.camera.notifyTerrainSourceLoaded();
    expect(fixture.map.cameraUpdates.at(-1)).toEqual({ duration: 300, pitch: 55 });

    fixture.map.emitMoveEnd();
    expect(fixture.map.cameraUpdates.at(-1)).toEqual(
      expect.objectContaining({
        center: [7.01, 0.01],
        duration: 350,
        freezeElevation: true,
        zoom: 15,
      }),
    );
    fixture.map.emitMoveEnd();
  });

  it('preserves manual zoom on later 3d transitions and when follow is disabled', () => {
    const fixture = new CameraFixture();
    const route = fixture.route();
    const view = fixture.view(route);
    const terrainOptions = { ...fixture.options, terrainEnabled: true };
    fixture.camera.fitNewRoute(route);
    fixture.camera.update(view, fixture.options);
    fixture.map.zoom = 17;

    fixture.camera.setTerrainEnabled(true);
    fixture.camera.update(view, terrainOptions);
    fixture.camera.notifyTerrainSourceLoaded();
    fixture.map.emitMoveEnd();
    expect(fixture.map.cameraUpdates.at(-1)).toEqual(
      expect.objectContaining({ center: [7, 0], duration: 350, freezeElevation: true }),
    );
    expect(fixture.map.cameraUpdates.at(-1)?.zoom).toBeUndefined();
    fixture.map.emitMoveEnd();
    expect(fixture.map.zoom).toBe(17);
    expect(fixture.map.zoomCalls).toBe(1);

    fixture.camera.setTerrainEnabled(false);
    fixture.camera.update(view, fixture.options);
    fixture.map.zoom = 14;
    fixture.camera.setTerrainEnabled(true);
    fixture.camera.update(view, { ...terrainOptions, autoFollow: false });
    fixture.camera.notifyTerrainSourceLoaded();
    fixture.map.emitMoveEnd();
    expect(fixture.map.cameraUpdates.at(-1)).toEqual({ duration: 350, freezeElevation: true });
    expect(fixture.map.zoom).toBe(14);
  });

  it('cancels pending terrain work and applies heading or north-up bearing updates', () => {
    const fixture = new CameraFixture();
    const route = fixture.route();
    const view = fixture.view(route);
    const terrainOptions = { ...fixture.options, terrainEnabled: true };
    fixture.map.sourceLoaded = false;

    fixture.camera.setTerrainEnabled(true);
    fixture.camera.update(view, terrainOptions);
    fixture.camera.setTerrainEnabled(false);
    fixture.map.sourceLoaded = true;
    fixture.camera.notifyTerrainSourceLoaded();
    expect(fixture.map.cameraUpdates).toHaveLength(0);

    fixture.camera.update(view, { ...fixture.options, headingUp: true });
    expect(fixture.map.cameraUpdates.at(-1)?.bearing).toBe(view.headingDegrees);
    fixture.camera.update(view, fixture.options);
    expect(fixture.map.cameraUpdates.at(-1)?.bearing).toBe(0);
  });
});
