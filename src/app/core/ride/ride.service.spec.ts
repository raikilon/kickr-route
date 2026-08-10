import { TestBed } from '@angular/core/testing';
import { GeoCoordinate } from '../route/geo-coordinate';
import { RouteProcessingPolicy } from '../route/route-processing-policy';
import { RouteSegment } from '../route/route-segment';
import { Route } from '../route/route';
import { TrainerService } from '../trainer/trainer.service';
import { RideService } from './ride.service';

describe('RideService', () => {
  it('allows starting when a route is loaded after connecting the trainer', async () => {
    const trainer = TestBed.inject(TrainerService);
    const ride = TestBed.inject(RideService);
    await trainer.connectDemo();
    expect(ride.canStart()).toBe(false);

    const segment = new RouteSegment(
      0,
      0,
      [
        { coordinate: new GeoCoordinate(0, 0), elevationMeters: 100 },
        { coordinate: new GeoCoordinate(0, 0.01), elevationMeters: 110 },
      ],
      new RouteProcessingPolicy(0, 100),
    );
    ride.setRoute(new Route('Connect first', [segment]));

    expect(ride.canStart()).toBe(true);
    await trainer.disconnect();
  });
});
