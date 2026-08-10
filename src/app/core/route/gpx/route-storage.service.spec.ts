import { RouteStorageService } from './route-storage.service';

describe('RouteStorageService', () => {
  const service = new RouteStorageService();

  beforeEach(() => localStorage.clear());

  it('stores, restores, replaces, and clears the latest route', () => {
    expect(service.saveLatest('first.gpx', '<gpx />')).toBe(true);
    expect(service.loadLatest()?.fileName).toBe('first.gpx');
    expect(service.saveLatest('second.gpx', '<gpx><rte /></gpx>')).toBe(true);
    expect(service.loadLatest()?.fileName).toBe('second.gpx');
    service.clear();
    expect(service.loadLatest()).toBeNull();
  });

  it('ignores corrupted stored data', () => {
    localStorage.setItem('kickr-route:last-gpx', '{broken');
    expect(service.loadLatest()).toBeNull();
  });
});
