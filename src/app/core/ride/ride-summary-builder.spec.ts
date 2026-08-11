import { Route } from '../route/route';
import { RideStatistics } from './ride-statistics';
import { RideSummaryBuilder } from './ride-summary-builder';

describe('RideSummaryBuilder', () => {
  afterEach(() => vi.useRealTimers());

  it('builds a snapshot from route progress and recorded statistics', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T12:00:00Z'));
    const route = {
      completionPercentageAt: vi.fn().mockReturnValue(40),
      ascentAt: vi.fn().mockReturnValue(120),
      gradientRangeAt: vi.fn().mockReturnValue({ minimumPercent: -3, maximumPercent: 8 }),
    } as unknown as Route;
    const statistics = new RideStatistics();
    statistics.record({ timestamp: 0, powerWatts: 100, cadenceRpm: 80, speedKph: 20 }, 10);
    statistics.record({ timestamp: 10_000, powerWatts: 300, cadenceRpm: 100, speedKph: 40 }, 5);

    const summary = new RideSummaryBuilder(route).build(statistics, 15, 400);

    expect(summary).toEqual({
      elapsedSeconds: 15,
      completedDistanceMeters: 400,
      completionPercentage: 40,
      averagePowerWatts: 500 / 3,
      maximumPowerWatts: 300,
      averageCadenceRpm: 260 / 3,
      maximumCadenceRpm: 100,
      averageSpeedKph: 80 / 3,
      maximumSpeedKph: 40,
      totalAscentMeters: 120,
      minimumGradientPercent: -3,
      maximumGradientPercent: 8,
      finishedAt: new Date('2026-08-11T12:00:00Z'),
    });
    expect(route.completionPercentageAt).toHaveBeenCalledWith(400);
    expect(route.ascentAt).toHaveBeenCalledWith(400);
    expect(route.gradientRangeAt).toHaveBeenCalledWith(400);
  });
});
