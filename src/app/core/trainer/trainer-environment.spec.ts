import { TrainerEnvironment } from './trainer-environment';

describe('TrainerEnvironment', () => {
  it('defaults to calm wind and the road posture', () => {
    expect(TrainerEnvironment.default.windSpeedKph).toBe(0);
    expect(TrainerEnvironment.default.ridingPosture).toBe('road');
    expect(TrainerEnvironment.default.windResistanceCoefficient).toBe(0.51);
  });

  it('converts wind speed to meters per second', () => {
    const environment = new TrainerEnvironment(18);
    expect(environment.windSpeedMetersPerSecond).toBe(5);
  });

  it('clamps wind to the supported user range', () => {
    expect(new TrainerEnvironment(-80).windSpeedKph).toBe(-50);
    expect(new TrainerEnvironment(80).windSpeedKph).toBe(50);
  });

  it('provides the aerodynamic coefficient for each posture', () => {
    expect(new TrainerEnvironment(0, 'aero').windResistanceCoefficient).toBe(0.3);
    expect(new TrainerEnvironment(0, 'road').windResistanceCoefficient).toBe(0.51);
    expect(new TrainerEnvironment(0, 'upright').windResistanceCoefficient).toBe(0.7);
  });
});
