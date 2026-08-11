import { Route } from '../route/route';
import { RideStatistics } from './ride-statistics';
import { RideSummary } from './ride-summary';

export class RideSummaryBuilder {
  constructor(private readonly route: Route) {}

  build(
    statistics: RideStatistics,
    elapsedSeconds: number,
    completedDistanceMeters: number,
  ): RideSummary {
    const gradientRange = this.route.gradientRangeAt(completedDistanceMeters);
    return {
      elapsedSeconds,
      completedDistanceMeters,
      completionPercentage: this.route.completionPercentageAt(completedDistanceMeters),
      averagePowerWatts: statistics.averagePowerWatts,
      maximumPowerWatts: statistics.maximumPowerWatts,
      averageCadenceRpm: statistics.averageCadenceRpm,
      maximumCadenceRpm: statistics.maximumCadenceRpm,
      averageSpeedKph: statistics.averageSpeedKph,
      maximumSpeedKph: statistics.maximumSpeedKph,
      totalAscentMeters: this.route.ascentAt(completedDistanceMeters),
      minimumGradientPercent: gradientRange.minimumPercent,
      maximumGradientPercent: gradientRange.maximumPercent,
      finishedAt: new Date(),
    };
  }
}
