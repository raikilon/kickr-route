import { GeoCoordinate } from './geo-coordinate';
import { Route } from './route';
import { RouteProcessingPolicy } from './route-processing-policy';
import { RouteSegment } from './route-segment';

describe('Route', () => {
  const policy = new RouteProcessingPolicy(0, 100);

  it('calculates cumulative distance, gradient, and ascent', () => {
    const segment = new RouteSegment(
      0,
      0,
      [
        { coordinate: new GeoCoordinate(0, 0), elevationMeters: 100 },
        { coordinate: new GeoCoordinate(0, 0.001), elevationMeters: 110 },
        { coordinate: new GeoCoordinate(0, 0.002), elevationMeters: 120 },
      ],
      policy,
    );
    const route = new Route('Climb', [segment]);
    expect(route.totalDistanceMeters).toBeCloseTo(222.39, 1);
    expect(route.totalAscentMeters).toBe(20);
    expect(route.points[1].gradientPercent).toBeCloseTo(8.99, 1);
  });

  it('interpolates route location and completed ascent', () => {
    const segment = new RouteSegment(
      0,
      0,
      [
        { coordinate: new GeoCoordinate(0, 0), elevationMeters: 100 },
        { coordinate: new GeoCoordinate(0, 0.001), elevationMeters: 110 },
      ],
      policy,
    );
    const route = new Route('Line', [segment]);
    const halfway = route.locationAt(route.totalDistanceMeters / 2);
    expect(halfway.coordinate.longitude).toBeCloseTo(0.0005, 6);
    expect(halfway.elevationMeters).toBeCloseTo(105, 6);
    expect(route.ascentAt(route.totalDistanceMeters / 2)).toBeCloseTo(5, 6);
  });

  it('does not add distance across segment gaps', () => {
    const firstSegment = new RouteSegment(
      0,
      0,
      [
        { coordinate: new GeoCoordinate(0, 0), elevationMeters: 0 },
        { coordinate: new GeoCoordinate(0, 0.001), elevationMeters: 0 },
      ],
      policy,
    );
    const secondSegment = new RouteSegment(
      1,
      firstSegment.endDistanceMeters,
      [
        { coordinate: new GeoCoordinate(10, 10), elevationMeters: 0 },
        { coordinate: new GeoCoordinate(10, 10.001), elevationMeters: 0 },
      ],
      policy,
    );
    const route = new Route('Segments', [firstSegment, secondSegment]);
    expect(route.totalDistanceMeters).toBeLessThan(230);
  });

  it('calculates heading using forward and route-end lookahead', () => {
    const segment = new RouteSegment(
      0,
      0,
      [
        { coordinate: new GeoCoordinate(0, 0), elevationMeters: 0 },
        { coordinate: new GeoCoordinate(0, 0.002), elevationMeters: 0 },
      ],
      policy,
    );
    const route = new Route('Eastbound', [segment]);
    expect(route.headingAt(route.totalDistanceMeters * 0.25)).toBeCloseTo(90, 1);
    expect(route.headingAt(route.totalDistanceMeters)).toBeCloseTo(90, 1);
  });
});
