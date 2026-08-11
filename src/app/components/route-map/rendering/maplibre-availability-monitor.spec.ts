import type { Map as MapLibreMap } from 'maplibre-gl';
import { MapLibreAvailabilityMonitor } from './maplibre-availability-monitor';

interface FakeMapEvent {
  readonly error?: Error;
  readonly sourceId?: string;
  readonly isSourceLoaded?: boolean;
  readonly tile?: unknown;
}

class FakeAvailabilityMap {
  private readonly listeners = new Map<string, Set<(event: FakeMapEvent) => void>>();

  on(event: string, listener: (event: FakeMapEvent) => void): void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  once(event: string, listener: (event: FakeMapEvent) => void): void {
    const onceListener = (payload: FakeMapEvent): void => {
      this.off(event, onceListener);
      listener(payload);
    };
    this.on(event, onceListener);
  }

  off(event: string, listener: (event: FakeMapEvent) => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: string, payload: FakeMapEvent = {}): void {
    this.listeners.get(event)?.forEach((listener) => listener(payload));
  }
}

describe('MapLibreAvailabilityMonitor', () => {
  it('reports map errors and loaded non-route sources', () => {
    const map = new FakeAvailabilityMap();
    const report = vi.fn();
    const monitor = new MapLibreAvailabilityMonitor(
      map as unknown as MapLibreMap,
      report,
      ['kickr-completed-route', 'kickr-remaining-route', 'kickr-route-points'],
      'kickr-terrain',
      vi.fn(),
    );
    monitor.observe();

    map.emit('error', { error: new Error('Tile failed.') });
    map.emit('sourcedata', {
      sourceId: 'kickr-completed-route',
      isSourceLoaded: true,
    });
    map.emit('sourcedata', { sourceId: 'openmaptiles', isSourceLoaded: false });
    map.emit('sourcedata', { sourceId: 'openmaptiles', isSourceLoaded: true });

    expect(report.mock.calls).toEqual([[false], [true]]);
  });

  it('queues a camera notification only for a fully loaded terrain tile', async () => {
    const map = new FakeAvailabilityMap();
    const notifyTerrain = vi.fn();
    const monitor = new MapLibreAvailabilityMonitor(
      map as unknown as MapLibreMap,
      vi.fn(),
      [],
      'kickr-terrain',
      notifyTerrain,
    );
    monitor.observe();

    map.emit('sourcedata', { sourceId: 'kickr-terrain', isSourceLoaded: true });
    map.emit('sourcedata', { sourceId: 'kickr-terrain', isSourceLoaded: false, tile: {} });
    expect(notifyTerrain).not.toHaveBeenCalled();

    map.emit('sourcedata', { sourceId: 'kickr-terrain', isSourceLoaded: true, tile: {} });
    expect(notifyTerrain).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(notifyTerrain).toHaveBeenCalledTimes(1);
  });

  it('resolves style readiness and rejects style initialization errors', async () => {
    const readyMap = new FakeAvailabilityMap();
    const readyMonitor = new MapLibreAvailabilityMonitor(
      readyMap as unknown as MapLibreMap,
      vi.fn(),
      [],
      'kickr-terrain',
      vi.fn(),
    );
    const ready = readyMonitor.waitForStyle();
    readyMap.emit('style.load');
    await expect(ready).resolves.toBeUndefined();

    const failedMap = new FakeAvailabilityMap();
    const failedMonitor = new MapLibreAvailabilityMonitor(
      failedMap as unknown as MapLibreMap,
      vi.fn(),
      [],
      'kickr-terrain',
      vi.fn(),
    );
    const failed = failedMonitor.waitForStyle();
    failedMap.emit('error', { error: new Error('Style failed.') });
    await expect(failed).rejects.toThrow('Style failed.');
  });
});
