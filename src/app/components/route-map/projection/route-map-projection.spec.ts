import { GeoCoordinate } from '../../../core/route/geo-coordinate';
import { RouteProcessingPolicy } from '../../../core/route/route-processing-policy';
import { RouteSegment } from '../../../core/route/route-segment';
import { Route } from '../../../core/route/route';
import { RouteMapProjection } from './route-map-projection';

describe('RouteMapProjection', () => {
  it('moves the rider and progress split to the interpolated route location', () => {
    const segment = new RouteSegment(
      0,
      0,
      [
        { coordinate: new GeoCoordinate(0, 0), elevationMeters: 100 },
        { coordinate: new GeoCoordinate(0, 0.01), elevationMeters: 110 },
      ],
      new RouteProcessingPolicy(0, 100),
    );
    const route = new Route('Map route', [segment]);
    const firstDistance = route.totalDistanceMeters * 0.25;
    const secondDistance = route.totalDistanceMeters * 0.75;
    const firstView = new RouteMapProjection(
      route,
      firstDistance,
      route.locationAt(firstDistance),
    ).project();
    const secondView = new RouteMapProjection(
      route,
      secondDistance,
      route.locationAt(secondDistance),
    ).project();

    expect(firstView.rider?.longitude).toBeCloseTo(0.0025, 5);
    expect(secondView.rider?.longitude).toBeCloseTo(0.0075, 5);
    expect(firstView.completedPaths[0].at(-1)?.longitude).toBeCloseTo(0.0025, 5);
    expect(secondView.remainingPaths[0][0].longitude).toBeCloseTo(0.0075, 5);
    expect(firstView.headingDegrees).toBeCloseTo(90, 1);
    expect(secondView.headingDegrees).toBeCloseTo(90, 1);
  });
});
