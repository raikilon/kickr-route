export class RouteProcessingPolicy {
  constructor(
    readonly elevationSmoothingWindowMeters = 50,
    readonly gradientWindowMeters = 100,
  ) {
    if (elevationSmoothingWindowMeters < 0) {
      throw new RangeError('Elevation smoothing window cannot be negative.');
    }
    if (gradientWindowMeters <= 0) {
      throw new RangeError('Gradient window must be greater than zero.');
    }
  }
}
