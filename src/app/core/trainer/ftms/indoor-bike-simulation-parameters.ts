import { TrainerEnvironment } from '../trainer-environment';
import { TrainerGrade } from '../trainer-grade';
import { FTMS_CONTROL_OPCODES } from './ftms.constants';

const ROLLING_RESISTANCE_COEFFICIENT = 0.004;

export class IndoorBikeSimulationParameters {
  constructor(
    private readonly grade: TrainerGrade,
    private readonly environment: TrainerEnvironment,
  ) {}

  encode(): Uint8Array {
    const payload = new Uint8Array(7);
    const view = new DataView(payload.buffer);
    view.setUint8(0, FTMS_CONTROL_OPCODES.indoorBikeSimulationParameters);
    view.setInt16(1, Math.round(this.environment.windSpeedMetersPerSecond * 1_000), true);
    view.setInt16(3, Math.round(this.grade.percent * 100), true);
    view.setUint8(5, Math.round(ROLLING_RESISTANCE_COEFFICIENT * 10_000));
    view.setUint8(6, Math.round(this.environment.windResistanceCoefficient * 100));
    return payload;
  }
}
