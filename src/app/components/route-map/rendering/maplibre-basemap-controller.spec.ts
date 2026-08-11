import type { Map as MapLibreMap } from 'maplibre-gl';
import { MapLibreBasemapController } from './maplibre-basemap-controller';

class FakeBasemapMap {
  readonly addedSources = new Map<string, unknown>();
  readonly addedLayers: string[] = [];
  readonly visibilityChanges: { layerId: string; visibility: string }[] = [];
  readonly terrainChanges: unknown[] = [];
  private readonly layers = new Set(['background', 'labels']);
  private readonly sources = new Set(['openmaptiles']);

  getStyle(): {
    layers: { id: string; layout?: { visibility?: 'visible' | 'none' } }[];
  } {
    return {
      layers: [{ id: 'background' }, { id: 'labels', layout: { visibility: 'none' } }],
    };
  }

  addSource(id: string, source: unknown): void {
    this.sources.add(id);
    this.addedSources.set(id, source);
  }

  getSource(id: string): unknown {
    if (this.sources.has(id)) {
      return {};
    }
    return undefined;
  }

  addLayer(layer: { id: string }): void {
    this.layers.add(layer.id);
    this.addedLayers.push(layer.id);
  }

  getLayer(id: string): unknown {
    if (this.layers.has(id)) {
      return {};
    }
    return undefined;
  }

  setLayoutProperty(layerId: string, _property: string, visibility: string): void {
    this.visibilityChanges.push({ layerId, visibility });
  }

  setTerrain(terrain: unknown): void {
    this.terrainChanges.push(terrain);
  }
}

describe('MapLibreBasemapController', () => {
  it('installs satellite, terrain, and optional building layers', () => {
    const map = new FakeBasemapMap();
    const basemap = new MapLibreBasemapController(map as unknown as MapLibreMap);

    basemap.initialize();

    expect(basemap.terrainSourceId).toBe('kickr-terrain');
    expect(map.addedSources.get('kickr-satellite')).toEqual(
      expect.objectContaining({ type: 'raster', tileSize: 256 }),
    );
    expect(map.addedSources.get('kickr-terrain')).toEqual({
      type: 'raster-dem',
      url: 'https://tiles.mapterhorn.com/tilejson.json',
      encoding: 'terrarium',
      tileSize: 512,
    });
    expect(map.addedLayers).toEqual(['kickr-satellite', 'kickr-satellite-buildings']);
  });

  it('restores original street visibility and only shows buildings for satellite terrain', () => {
    const map = new FakeBasemapMap();
    const basemap = new MapLibreBasemapController(map as unknown as MapLibreMap);
    basemap.initialize();

    basemap.applyBasemap('street');
    expect(map.visibilityChanges).toContainEqual({ layerId: 'background', visibility: 'visible' });
    expect(map.visibilityChanges).toContainEqual({ layerId: 'labels', visibility: 'none' });

    basemap.applyBasemap('satellite');
    expect(map.visibilityChanges.at(-2)).toEqual({
      layerId: 'kickr-satellite',
      visibility: 'visible',
    });
    expect(map.visibilityChanges.at(-1)).toEqual({
      layerId: 'kickr-satellite-buildings',
      visibility: 'none',
    });

    basemap.applyTerrain(true);
    expect(map.terrainChanges.at(-1)).toEqual({ source: 'kickr-terrain', exaggeration: 1 });
    expect(map.visibilityChanges.at(-1)).toEqual({
      layerId: 'kickr-satellite-buildings',
      visibility: 'visible',
    });

    basemap.applyBasemap('street');
    expect(map.visibilityChanges.at(-1)).toEqual({
      layerId: 'kickr-satellite-buildings',
      visibility: 'none',
    });
    basemap.applyTerrain(false);
    expect(map.terrainChanges.at(-1)).toBeNull();
  });
});
