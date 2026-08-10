import { TrainerTelemetry } from '../trainer/trainer-telemetry';

class WeightedMetric {
  private weightedTotal = 0;
  private durationSeconds = 0;
  private maximumValue = 0;

  record(value: number | undefined, sampleDurationSeconds: number): void {
    if (!this.isValid(value) || sampleDurationSeconds <= 0) {
      return;
    }
    this.weightedTotal += value * sampleDurationSeconds;
    this.durationSeconds += sampleDurationSeconds;
    this.maximumValue = Math.max(this.maximumValue, value);
  }

  average(): number {
    if (this.durationSeconds <= 0) {
      return 0;
    }
    return this.weightedTotal / this.durationSeconds;
  }

  maximum(): number {
    return this.maximumValue;
  }

  total(): number {
    return this.weightedTotal;
  }

  private isValid(value: number | undefined): value is number {
    return value !== undefined && Number.isFinite(value) && value >= 0;
  }
}

export class RideStatistics {
  private readonly power = new WeightedMetric();
  private readonly cadence = new WeightedMetric();
  private readonly speed = new WeightedMetric();

  record(telemetry: TrainerTelemetry | null, durationSeconds: number): void {
    if (!telemetry || durationSeconds <= 0) {
      return;
    }
    this.power.record(telemetry.powerWatts, durationSeconds);
    this.cadence.record(telemetry.cadenceRpm, durationSeconds);
    this.speed.record(telemetry.speedKph, durationSeconds);
  }

  get averagePowerWatts(): number {
    return this.power.average();
  }

  get maximumPowerWatts(): number {
    return this.power.maximum();
  }

  get averageCadenceRpm(): number {
    return this.cadence.average();
  }

  get maximumCadenceRpm(): number {
    return this.cadence.maximum();
  }

  get averageSpeedKph(): number {
    return this.speed.average();
  }

  get maximumSpeedKph(): number {
    return this.speed.maximum();
  }

  get estimatedEnergyKilojoules(): number {
    return this.power.total() / 1_000;
  }
}
