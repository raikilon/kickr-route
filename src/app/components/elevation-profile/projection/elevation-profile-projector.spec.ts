import { GeoCoordinate } from '../../../core/route/geo-coordinate';
import { RouteProcessingPolicy } from '../../../core/route/route-processing-policy';
import { RouteSegment } from '../../../core/route/route-segment';
import { Route } from '../../../core/route/route';
import { ElevationProfileProjector } from './elevation-profile-projector';

describe('ElevationProfileProjector', () => {
  it('projects a rider-centered zoom window', () => {
    const segment = new RouteSegment(
      0,
      0,
      [
        { coordinate: new GeoCoordinate(0, 0), elevationMeters: 100 },
        { coordinate: new GeoCoordinate(0, 0.05), elevationMeters: 200 },
        { coordinate: new GeoCoordinate(0, 0.1), elevationMeters: 300 },
      ],
      new RouteProcessingPolicy(0, 100),
    );
    const route = new Route('Long climb', [segment]);
    const projection = new ElevationProfileProjector(route, 5_000, 2_000).project()!;

    expect(projection.viewportStartMeters).toBeCloseTo(4_500, 0);
    expect(projection.viewportEndMeters).toBeCloseTo(6_500, 0);
    expect(projection.markerX).toBeCloseTo(250, 0);
    expect(projection.distanceTicks.map((tick) => tick.label)).toEqual([
      '4.5 km',
      '5.0 km',
      '5.5 km',
      '6.0 km',
      '6.5 km',
    ]);
    expect(projection.distanceGuides.map((guide) => guide.x)).toEqual([125, 375, 625, 875]);
    expect(projection.isFullRoute).toBe(false);
    expect(projection.paths.length).toBeGreaterThan(0);
  });

  it('returns no profile when the whole route lacks elevation', () => {
    const segment = new RouteSegment(
      0,
      0,
      [
        { coordinate: new GeoCoordinate(0, 0), elevationMeters: null },
        { coordinate: new GeoCoordinate(0, 0.01), elevationMeters: null },
      ],
      new RouteProcessingPolicy(0, 100),
    );
    const route = new Route('No elevation', [segment]);
    expect(new ElevationProfileProjector(route, 0, null).project()).toBeNull();
  });
});
