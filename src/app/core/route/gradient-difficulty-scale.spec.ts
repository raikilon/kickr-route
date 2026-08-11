import { GradientDifficultyScale } from './gradient-difficulty-scale';

describe('GradientDifficultyScale', () => {
  it('classifies gradient thresholds', () => {
    const scale = new GradientDifficultyScale();
    expect(scale.classify(-0.1).label).toBe('Descent');
    expect(scale.classify(0).label).toBe('Easy');
    expect(scale.classify(3).label).toBe('Moderate');
    expect(scale.classify(6).label).toBe('Hard');
    expect(scale.classify(9).label).toBe('Very hard');
  });
});
