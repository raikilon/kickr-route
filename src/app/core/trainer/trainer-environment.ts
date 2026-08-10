export type RidingPosture = 'aero' | 'road' | 'upright';

export class TrainerEnvironment {
  static readonly minimumWindSpeedKph = -50;
  static readonly maximumWindSpeedKph = 50;
  static readonly default = new TrainerEnvironment();

  readonly windSpeedKph: number;

  constructor(
    requestedWindSpeedKph = 0,
    readonly ridingPosture: RidingPosture = 'road',
  ) {
    if (!Number.isFinite(requestedWindSpeedKph)) {
      throw new RangeError('Wind speed must be a finite number.');
    }
    this.windSpeedKph = Math.min(
      TrainerEnvironment.maximumWindSpeedKph,
      Math.max(TrainerEnvironment.minimumWindSpeedKph, requestedWindSpeedKph),
    );
  }

  get windSpeedMetersPerSecond(): number {
    return this.windSpeedKph / 3.6;
  }

  get windResistanceCoefficient(): number {
    switch (this.ridingPosture) {
      case 'aero':
        return 0.3;
      case 'upright':
        return 0.7;
      default:
        return 0.51;
    }
  }

  withWindSpeed(requestedWindSpeedKph: number): TrainerEnvironment {
    return new TrainerEnvironment(requestedWindSpeedKph, this.ridingPosture);
  }

  withRidingPosture(ridingPosture: RidingPosture): TrainerEnvironment {
    return new TrainerEnvironment(this.windSpeedKph, ridingPosture);
  }

  differsFrom(other: TrainerEnvironment): boolean {
    return this.windSpeedKph !== other.windSpeedKph || this.ridingPosture !== other.ridingPosture;
  }
}
