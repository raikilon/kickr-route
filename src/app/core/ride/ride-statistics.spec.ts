import { RideStatistics } from './ride-statistics';

describe('RideStatistics', () => {
  it('calculates time-weighted averages and maximums', () => {
    const statistics = new RideStatistics();
    statistics.record({ timestamp: 0, powerWatts: 100, cadenceRpm: 80, speedKph: 20 }, 10);
    statistics.record({ timestamp: 10_000, powerWatts: 300, cadenceRpm: 100, speedKph: 40 }, 5);
    expect(statistics.averagePowerWatts).toBeCloseTo(166.67, 2);
    expect(statistics.averageCadenceRpm).toBeCloseTo(86.67, 2);
    expect(statistics.averageSpeedKph).toBeCloseTo(26.67, 2);
    expect(statistics.maximumPowerWatts).toBe(300);
    expect(statistics.maximumCadenceRpm).toBe(100);
    expect(statistics.maximumSpeedKph).toBe(40);
  });
});
