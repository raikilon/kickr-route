import { TrainerEnvironment } from '../trainer-environment';
import { TrainerGrade } from '../trainer-grade';
import { IndoorBikeSimulationParameters } from './indoor-bike-simulation-parameters';

describe('IndoorBikeSimulationParameters', () => {
  it('encodes headwind, grade, rolling resistance, and road posture', () => {
    const parameters = new IndoorBikeSimulationParameters(
      new TrainerGrade(5),
      new TrainerEnvironment(18, 'road'),
    );
    expect([...parameters.encode()]).toEqual([0x11, 0x88, 0x13, 0xf4, 0x01, 0x28, 0x33]);
  });

  it('encodes tailwind as a signed value', () => {
    const parameters = new IndoorBikeSimulationParameters(
      TrainerGrade.neutral,
      new TrainerEnvironment(-18, 'road'),
    );
    expect([...parameters.encode()]).toEqual([0x11, 0x78, 0xec, 0x00, 0x00, 0x28, 0x33]);
  });

  it('encodes posture-specific wind resistance', () => {
    const aero = new IndoorBikeSimulationParameters(
      TrainerGrade.neutral,
      new TrainerEnvironment(0, 'aero'),
    );
    const upright = new IndoorBikeSimulationParameters(
      TrainerGrade.neutral,
      new TrainerEnvironment(0, 'upright'),
    );
    expect(aero.encode()[6]).toBe(0x1e);
    expect(upright.encode()[6]).toBe(0x46);
  });
});
