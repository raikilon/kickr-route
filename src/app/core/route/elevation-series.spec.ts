import { ElevationSeries } from './elevation-series';

describe('ElevationSeries', () => {
  it('interpolates missing elevations', () => {
    const series = new ElevationSeries([100, null, 120], [0, 50, 100], 0);
    expect(series.elevationAtIndex(0)).toBe(100);
    expect(series.elevationAtIndex(1)).toBe(110);
    expect(series.elevationAtIndex(2)).toBe(120);
  });

  it('keeps elevation unavailable when no samples are present', () => {
    const series = new ElevationSeries([null, null], [0, 50], 20);
    expect(series.hasElevation).toBe(false);
    expect(series.elevationAtIndex(0)).toBeNull();
    expect(series.gradientPercentAt(25, 50)).toBe(0);
  });

  it('smooths elevation over a distance window', () => {
    const series = new ElevationSeries([100, 130, 100], [0, 10, 20], 20);
    expect(series.elevationAtIndex(0)).toBe(115);
    expect(series.elevationAtIndex(1)).toBe(110);
    expect(series.elevationAtIndex(2)).toBe(115);
  });

  it('calculates gradient over a distance window', () => {
    const series = new ElevationSeries([100, 110, 120], [0, 100, 200], 0);
    expect(series.gradientPercentAt(100, 100)).toBeCloseTo(10, 6);
  });
});
