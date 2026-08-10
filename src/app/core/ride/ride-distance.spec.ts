import { RideDistance } from './ride-distance';

describe('RideDistance', () => {
  it('integrates instantaneous speed over elapsed ride time', () => {
    const distance = new RideDistance(10_000);
    distance.advance(36, 10);
    expect(distance.completedMeters).toBe(100);
  });

  it('does not advance without valid speed and elapsed time', () => {
    const distance = new RideDistance(1_000);
    distance.advance(undefined, 10);
    distance.advance(-1, 10);
    distance.advance(20, 0);
    expect(distance.completedMeters).toBe(0);
  });

  it('stops advancing at the end of the route', () => {
    const distance = new RideDistance(50);
    distance.advance(36, 10);
    expect(distance.completedMeters).toBe(50);
  });
});
