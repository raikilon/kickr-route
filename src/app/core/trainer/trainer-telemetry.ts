export interface TrainerTelemetry {
  readonly timestamp: number;
  readonly speedKph?: number;
  readonly cadenceRpm?: number;
  readonly powerWatts?: number;
}

export interface IndoorBikeData extends Omit<TrainerTelemetry, 'timestamp'> {
  readonly averageSpeedKph?: number;
  readonly averageCadenceRpm?: number;
  readonly totalDistanceMeters?: number;
  readonly resistanceLevel?: number;
  readonly averagePowerWatts?: number;
  readonly totalEnergyKcal?: number;
  readonly energyPerHourKcal?: number;
  readonly energyPerMinuteKcal?: number;
}
