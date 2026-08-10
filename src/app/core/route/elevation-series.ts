export class ElevationSeries {
  readonly hasElevation: boolean;
  private readonly processedElevationsMeters: readonly (number | null)[];

  constructor(
    elevationsMeters: readonly (number | null)[],
    private readonly distancesMeters: readonly number[],
    smoothingWindowMeters: number,
  ) {
    this.assertMatchingLengths(elevationsMeters);
    this.hasElevation = elevationsMeters.some((elevation) => elevation !== null);
    const completeElevations = this.interpolateMissingElevations(elevationsMeters);
    this.processedElevationsMeters = this.smoothElevations(
      completeElevations,
      smoothingWindowMeters,
    );
  }

  elevationAtIndex(index: number): number | null {
    return this.processedElevationsMeters[index];
  }

  gradientPercentAt(distanceMeters: number, windowMeters: number): number {
    const firstDistance = this.distancesMeters[0];
    const lastDistance = this.distancesMeters.at(-1) ?? firstDistance;
    const startDistance = Math.max(firstDistance, distanceMeters - windowMeters / 2);
    const endDistance = Math.min(lastDistance, distanceMeters + windowMeters / 2);
    if (endDistance <= startDistance) {
      return 0;
    }
    const startElevation = this.elevationAtDistance(startDistance);
    const endElevation = this.elevationAtDistance(endDistance);
    if (startElevation === null || endElevation === null) {
      return 0;
    }
    return ((endElevation - startElevation) / (endDistance - startDistance)) * 100;
  }

  private interpolateMissingElevations(
    sourceElevationsMeters: readonly (number | null)[],
  ): (number | null)[] {
    const elevationsMeters = [...sourceElevationsMeters];
    const knownIndexes = this.collectKnownIndexes(elevationsMeters);
    if (knownIndexes.length === 0) {
      return elevationsMeters;
    }
    this.fillLeadingElevations(elevationsMeters, knownIndexes[0]);
    this.fillElevationGaps(elevationsMeters, knownIndexes);
    this.fillTrailingElevations(elevationsMeters, knownIndexes.at(-1)!);
    return elevationsMeters;
  }

  private collectKnownIndexes(elevationsMeters: readonly (number | null)[]): number[] {
    const knownIndexes: number[] = [];
    elevationsMeters.forEach((elevation, index) => {
      if (elevation !== null) {
        knownIndexes.push(index);
      }
    });
    return knownIndexes;
  }

  private fillLeadingElevations(
    elevationsMeters: (number | null)[],
    firstKnownIndex: number,
  ): void {
    const firstElevation = elevationsMeters[firstKnownIndex]!;
    for (let index = 0; index < firstKnownIndex; index += 1) {
      elevationsMeters[index] = firstElevation;
    }
  }

  private fillTrailingElevations(
    elevationsMeters: (number | null)[],
    lastKnownIndex: number,
  ): void {
    const lastElevation = elevationsMeters[lastKnownIndex]!;
    for (let index = lastKnownIndex + 1; index < elevationsMeters.length; index += 1) {
      elevationsMeters[index] = lastElevation;
    }
  }

  private fillElevationGaps(
    elevationsMeters: (number | null)[],
    knownIndexes: readonly number[],
  ): void {
    for (let knownIndex = 1; knownIndex < knownIndexes.length; knownIndex += 1) {
      const startIndex = knownIndexes[knownIndex - 1];
      const endIndex = knownIndexes[knownIndex];
      this.fillElevationGap(elevationsMeters, startIndex, endIndex);
    }
  }

  private fillElevationGap(
    elevationsMeters: (number | null)[],
    startIndex: number,
    endIndex: number,
  ): void {
    const startElevation = elevationsMeters[startIndex]!;
    const endElevation = elevationsMeters[endIndex]!;
    const distanceSpan = this.distancesMeters[endIndex] - this.distancesMeters[startIndex];
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distanceFromStart = this.distancesMeters[index] - this.distancesMeters[startIndex];
      let ratio = 0;
      if (distanceSpan > 0) {
        ratio = distanceFromStart / distanceSpan;
      }
      elevationsMeters[index] = startElevation + (endElevation - startElevation) * ratio;
    }
  }

  private smoothElevations(
    elevationsMeters: readonly (number | null)[],
    windowMeters: number,
  ): (number | null)[] {
    const smoothedElevations: (number | null)[] = [];
    const halfWindowMeters = windowMeters / 2;
    let leftIndex = 0;
    let rightIndex = 0;
    let elevationSum = 0;
    let elevationCount = 0;
    for (let index = 0; index < elevationsMeters.length; index += 1) {
      const minimumDistance = this.distancesMeters[index] - halfWindowMeters;
      const maximumDistance = this.distancesMeters[index] + halfWindowMeters;
      while (this.distancesMeters[leftIndex] < minimumDistance) {
        const elevation = elevationsMeters[leftIndex];
        if (elevation !== null) {
          elevationSum -= elevation;
          elevationCount -= 1;
        }
        leftIndex += 1;
      }
      while (
        rightIndex < elevationsMeters.length &&
        this.distancesMeters[rightIndex] <= maximumDistance
      ) {
        const elevation = elevationsMeters[rightIndex];
        if (elevation !== null) {
          elevationSum += elevation;
          elevationCount += 1;
        }
        rightIndex += 1;
      }
      smoothedElevations.push(
        this.smoothedElevationAt(index, elevationsMeters, elevationSum, elevationCount),
      );
    }
    return smoothedElevations;
  }

  private smoothedElevationAt(
    index: number,
    elevationsMeters: readonly (number | null)[],
    elevationSum: number,
    elevationCount: number,
  ): number | null {
    if (elevationsMeters[index] === null || elevationCount === 0) {
      return null;
    }
    return elevationSum / elevationCount;
  }

  private elevationAtDistance(distanceMeters: number): number | null {
    const nextIndex = this.findFirstIndexAtOrAfter(distanceMeters);
    if (nextIndex <= 0) {
      return this.processedElevationsMeters[0];
    }
    const previousIndex = nextIndex - 1;
    const distanceSpan = this.distancesMeters[nextIndex] - this.distancesMeters[previousIndex];
    if (distanceSpan <= 0) {
      return this.processedElevationsMeters[previousIndex];
    }
    const ratio = (distanceMeters - this.distancesMeters[previousIndex]) / distanceSpan;
    return this.interpolateElevation(previousIndex, nextIndex, ratio);
  }

  private findFirstIndexAtOrAfter(distanceMeters: number): number {
    let lowIndex = 0;
    let highIndex = this.distancesMeters.length - 1;
    while (lowIndex < highIndex) {
      const middleIndex = Math.floor((lowIndex + highIndex) / 2);
      if (this.distancesMeters[middleIndex] < distanceMeters) {
        lowIndex = middleIndex + 1;
        continue;
      }
      highIndex = middleIndex;
    }
    return lowIndex;
  }

  private interpolateElevation(
    firstIndex: number,
    secondIndex: number,
    ratio: number,
  ): number | null {
    const firstElevation = this.processedElevationsMeters[firstIndex];
    const secondElevation = this.processedElevationsMeters[secondIndex];
    if (firstElevation === null) {
      return secondElevation;
    }
    if (secondElevation === null) {
      return firstElevation;
    }
    return firstElevation + (secondElevation - firstElevation) * ratio;
  }

  private assertMatchingLengths(elevationsMeters: readonly (number | null)[]): void {
    if (elevationsMeters.length !== this.distancesMeters.length) {
      throw new Error('Elevation and distance series must contain the same number of values.');
    }
  }
}
