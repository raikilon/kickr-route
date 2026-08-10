export interface RideSummary {
  readonly elapsedSeconds: number;
  readonly completedDistanceMeters: number;
  readonly completionPercentage: number;
  readonly averagePowerWatts: number;
  readonly maximumPowerWatts: number;
  readonly averageCadenceRpm: number;
  readonly maximumCadenceRpm: number;
  readonly averageSpeedKph: number;
  readonly maximumSpeedKph: number;
  readonly totalAscentMeters: number;
  readonly estimatedEnergyKilojoules: number;
  readonly minimumGradientPercent: number;
  readonly maximumGradientPercent: number;
  readonly finishedAt: Date;
}
