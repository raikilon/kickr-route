import { GeoCoordinate } from './geo-coordinate';

describe('GeoCoordinate', () => {
  it('calculates Haversine distance between coordinates', () => {
    const start = new GeoCoordinate(0, 0);
    const finish = new GeoCoordinate(0, 0.001);
    expect(start.distanceTo(finish)).toBeCloseTo(111.19, 1);
  });

  it('interpolates between coordinates', () => {
    const start = new GeoCoordinate(0, 0);
    const finish = new GeoCoordinate(2, 4);
    const midpoint = start.interpolateTowards(finish, 0.5);
    expect(midpoint.latitude).toBe(1);
    expect(midpoint.longitude).toBe(2);
  });

  it('calculates a compass bearing toward another coordinate', () => {
    const origin = new GeoCoordinate(0, 0);
    expect(origin.bearingTo(new GeoCoordinate(1, 0))).toBeCloseTo(0, 6);
    expect(origin.bearingTo(new GeoCoordinate(0, 1))).toBeCloseTo(90, 6);
    expect(origin.bearingTo(new GeoCoordinate(-1, 0))).toBeCloseTo(180, 6);
    expect(origin.bearingTo(new GeoCoordinate(0, -1))).toBeCloseTo(270, 6);
  });

  it('rejects coordinates outside valid ranges', () => {
    expect(() => new GeoCoordinate(91, 0)).toThrow(RangeError);
    expect(() => new GeoCoordinate(0, 181)).toThrow(RangeError);
  });
});
