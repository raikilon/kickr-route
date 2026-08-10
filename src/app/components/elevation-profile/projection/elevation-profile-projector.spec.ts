import { GeoCoordinate } from '../../../core/route/geo-coordinate';
import { RouteProcessingPolicy } from '../../../core/route/route-processing-policy';
import { RouteSegment } from '../../../core/route/route-segment';
import { Route } from '../../../core/route/route';
import { ElevationProfileProjector, GradientDifficultyScale } from './elevation-profile-projector';

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

  it('uses wider distance ticks for a long full-route view', () => {
    const segment = new RouteSegment(
      0,
      0,
      [
        { coordinate: new GeoCoordinate(0, 0), elevationMeters: 100 },
        { coordinate: new GeoCoordinate(0, 0.2), elevationMeters: 200 },
      ],
      new RouteProcessingPolicy(0, 100),
    );
    const projection = new ElevationProfileProjector(
      new Route('Long route', [segment]),
      0,
      null,
    ).project()!;

    expect(projection.distanceTicks.map((tick) => tick.label)).toEqual([
      '0 km',
      '5 km',
      '10 km',
      '15 km',
      '20 km',
    ]);
    expect(projection.distanceGuides).toHaveLength(4);
  });

  it('clamps zoom at the route finish', () => {
    const segment = new RouteSegment(
      0,
      0,
      [
        { coordinate: new GeoCoordinate(0, 0), elevationMeters: 100 },
        { coordinate: new GeoCoordinate(0, 0.03), elevationMeters: 160 },
      ],
      new RouteProcessingPolicy(0, 100),
    );
    const route = new Route('Finish', [segment]);
    const riderDistance = route.totalDistanceMeters - 50;
    const projection = new ElevationProfileProjector(route, riderDistance, 1_000).project()!;

    expect(projection.viewportEndMeters).toBeCloseTo(route.totalDistanceMeters, 6);
  });

  it('classifies gradient thresholds for the difficulty legend', () => {
    const scale = new GradientDifficultyScale();
    expect(scale.classify(-0.1).label).toBe('Descent');
    expect(scale.classify(0).label).toBe('Easy');
    expect(scale.classify(3).label).toBe('Moderate');
    expect(scale.classify(6).label).toBe('Hard');
    expect(scale.classify(9).label).toBe('Very hard');
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
