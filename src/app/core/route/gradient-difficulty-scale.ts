export interface GradientDifficulty {
  readonly label: string;
  readonly range: string;
  readonly color: string;
}

export class GradientDifficultyScale {
  readonly entries: readonly GradientDifficulty[] = [
    { label: 'Descent', range: '< 0%', color: '#24b8ff' },
    { label: 'Easy', range: '0–3%', color: '#beff2a' },
    { label: 'Moderate', range: '3–6%', color: '#ffc857' },
    { label: 'Hard', range: '6–9%', color: '#ff8a3d' },
    { label: 'Very hard', range: '9%+', color: '#ff6577' },
  ];

  classify(gradientPercent: number): GradientDifficulty {
    if (gradientPercent < 0) {
      return this.entries[0];
    }
    if (gradientPercent < 3) {
      return this.entries[1];
    }
    if (gradientPercent < 6) {
      return this.entries[2];
    }
    if (gradientPercent < 9) {
      return this.entries[3];
    }
    return this.entries[4];
  }
}
