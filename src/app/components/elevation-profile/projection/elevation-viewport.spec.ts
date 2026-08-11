import { ElevationViewport } from './elevation-viewport';

describe('ElevationViewport', () => {
  it('positions the rider one quarter into a zoomed viewport', () => {
    const viewport = new ElevationViewport(10_000, 5_000, 2_000);

    expect(viewport.startMeters).toBe(4_500);
    expect(viewport.endMeters).toBe(6_500);
    expect(viewport.xForDistance(5_000)).toBe(250);
    expect(viewport.isFullRoute).toBe(false);
  });

  it('clamps a zoomed viewport and X projection to the route bounds', () => {
    const viewport = new ElevationViewport(3_000, 2_950, 1_000);

    expect(viewport.startMeters).toBe(2_000);
    expect(viewport.endMeters).toBe(3_000);
    expect(viewport.xForDistance(1_000)).toBe(0);
    expect(viewport.xForDistance(4_000)).toBe(1_000);
  });

  it('uses the full route when no smaller zoom is requested', () => {
    const viewport = new ElevationViewport(3_000, 1_000, null);

    expect(viewport.startMeters).toBe(0);
    expect(viewport.endMeters).toBe(3_000);
    expect(viewport.isFullRoute).toBe(true);
  });
});
