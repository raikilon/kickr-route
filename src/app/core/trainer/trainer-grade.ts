export class TrainerGrade {
  static readonly neutral = new TrainerGrade(0);

  readonly percent: number;

  constructor(requestedPercent: number) {
    this.percent = Math.min(15, Math.max(-10, requestedPercent));
  }

  differsMeaningfullyFrom(other: TrainerGrade | null): boolean {
    if (!other) {
      return true;
    }
    return Math.abs(this.percent - other.percent) >= 0.2;
  }
}
