import type { Map as MapLibreMap, MapLibreEvent } from 'maplibre-gl';

export class MapLibreAvailabilityMonitor {
  constructor(
    private readonly map: MapLibreMap,
    private readonly reportTileAvailability: (available: boolean) => void,
    private readonly routeSourceIds: readonly string[],
    private readonly terrainSourceId: string,
    private readonly notifyTerrainSourceLoaded: () => void,
  ) {}

  observe(): void {
    this.map.on('error', () => this.reportTileAvailability(false));
    this.map.on('sourcedata', (event) => this.reportLoadedSource(event));
  }

  waitForStyle(): Promise<void> {
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

  private reportLoadedSource(
    event: MapLibreEvent & { sourceId?: string; isSourceLoaded?: boolean; tile?: unknown },
  ): void {
    if (!event.sourceId || !event.isSourceLoaded) {
      return;
    }
    if (this.routeSourceIds.includes(event.sourceId)) {
      return;
    }
    this.reportTileAvailability(true);
    if (event.sourceId === this.terrainSourceId && event.tile) {
      queueMicrotask(() => this.notifyTerrainSourceLoaded());
    }
  }
}
