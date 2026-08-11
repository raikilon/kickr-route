import { GeoCoordinate } from '../../../core/route/geo-coordinate';
import { RouteProcessingPolicy } from '../../../core/route/route-processing-policy';
import { RouteSegment } from '../../../core/route/route-segment';
import { Route } from '../../../core/route/route';
import { ElevationPathProjector } from './elevation-path-projector';
import { ElevationViewport } from './elevation-viewport';

describe('ElevationPathProjector', () => {
  it('samples viewport boundaries and projects visible elevation paths and bounds', () => {
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
    const viewport = new ElevationViewport(route.totalDistanceMeters, 5_000, 2_000);

    const projection = new ElevationPathProjector(route, viewport).project(5_000);

    expect(projection.minimumElevationMeters).toBeCloseTo(
      route.locationAt(viewport.startMeters).elevationMeters!,
      6,
    );
    expect(projection.maximumElevationMeters).toBeCloseTo(
      route.locationAt(viewport.endMeters).elevationMeters!,
      6,
    );
    expect(projection.paths[0].path).toMatch(/^M 0\.00 272\.00 /);
    expect(projection.paths.at(-1)!.path).toMatch(/L 1000\.00 20\.00$/);
    expect(projection.markerX).toBe(250);
    expect(projection.markerY).not.toBeNull();
  });

  it('projects unknown segments at the plot baseline and hides their rider marker', () => {
    const policy = new RouteProcessingPolicy(0, 100);
    const knownSegment = new RouteSegment(
      0,
      0,
      [
        { coordinate: new GeoCoordinate(0, 0), elevationMeters: 100 },
        { coordinate: new GeoCoordinate(0, 0.01), elevationMeters: 200 },
      ],
      policy,
    );
    const unknownSegment = new RouteSegment(
      1,
      knownSegment.endDistanceMeters,
      [
        { coordinate: new GeoCoordinate(0, 0.01), elevationMeters: null },
        { coordinate: new GeoCoordinate(0, 0.02), elevationMeters: null },
      ],
      policy,
    );
    const route = new Route('Partial elevation', [knownSegment, unknownSegment]);
    const viewport = new ElevationViewport(route.totalDistanceMeters, 0, null);
    const riderDistanceMeters =
      unknownSegment.startDistanceMeters + unknownSegment.lengthMeters / 2;

    const projection = new ElevationPathProjector(route, viewport).project(riderDistanceMeters);

    expect(projection.paths).toHaveLength(1);
    expect(projection.unknownPaths).toEqual(['M 500.00 272 L 1000.00 272']);
    expect(projection.minimumElevationMeters).toBe(100);
    expect(projection.maximumElevationMeters).toBe(200);
    expect(projection.markerX).toBe(750);
    expect(projection.markerY).toBeNull();
  });
});
