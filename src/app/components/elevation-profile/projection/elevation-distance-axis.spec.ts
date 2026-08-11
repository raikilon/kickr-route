import { ElevationDistanceAxis } from './elevation-distance-axis';
import { ElevationViewport } from './elevation-viewport';

describe('ElevationDistanceAxis', () => {
  it('projects zoomed ticks, labels, and midpoint guides', () => {
    const axis = new ElevationDistanceAxis(new ElevationViewport(10_000, 5_000, 2_000));

    const projection = axis.project();

    expect(projection.ticks.map((tick) => tick.label)).toEqual([
      '4.5 km',
      '5.0 km',
      '5.5 km',
      '6.0 km',
      '6.5 km',
    ]);
    expect(projection.ticks.map((tick) => tick.labelX)).toEqual([30, 250, 500, 750, 970]);
    expect(projection.guides.map((guide) => guide.x)).toEqual([125, 375, 625, 875]);
  });

  it('uses wider integer-kilometer ticks for a long full-route view', () => {
    const axis = new ElevationDistanceAxis(new ElevationViewport(22_239, 0, null));

    const projection = axis.project();

    expect(projection.ticks.map((tick) => tick.label)).toEqual([
      '0 km',
      '5 km',
      '10 km',
      '15 km',
      '20 km',
    ]);
    expect(projection.guides).toHaveLength(4);
  });
});
