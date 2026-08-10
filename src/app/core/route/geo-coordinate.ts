const EARTH_RADIUS_METERS = 6_371_000;

export class GeoCoordinate {
  constructor(
    readonly latitude: number,
    readonly longitude: number,
  ) {
    this.assertLatitude();
    this.assertLongitude();
  }

  distanceTo(other: GeoCoordinate): number {
    const latitudeDelta = this.toRadians(other.latitude - this.latitude);
    const longitudeDelta = this.toRadians(other.longitude - this.longitude);
    const firstLatitude = this.toRadians(this.latitude);
    const secondLatitude = this.toRadians(other.latitude);
    const squaredHalfChord =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
    const angularDistance =
      2 * Math.atan2(Math.sqrt(squaredHalfChord), Math.sqrt(1 - squaredHalfChord));
    return EARTH_RADIUS_METERS * angularDistance;
  }

  bearingTo(other: GeoCoordinate): number {
    const firstLatitude = this.toRadians(this.latitude);
    const secondLatitude = this.toRadians(other.latitude);
    const longitudeDelta = this.toRadians(other.longitude - this.longitude);
    const y = Math.sin(longitudeDelta) * Math.cos(secondLatitude);
    const x =
      Math.cos(firstLatitude) * Math.sin(secondLatitude) -
      Math.sin(firstLatitude) * Math.cos(secondLatitude) * Math.cos(longitudeDelta);
    const bearingDegrees = (Math.atan2(y, x) * 180) / Math.PI;
    return (bearingDegrees + 360) % 360;
  }

  interpolateTowards(other: GeoCoordinate, requestedRatio: number): GeoCoordinate {
    const ratio = this.clampRatio(requestedRatio);
    const latitude = this.latitude + (other.latitude - this.latitude) * ratio;
    const longitude = this.longitude + (other.longitude - this.longitude) * ratio;
    return new GeoCoordinate(latitude, longitude);
  }

  private assertLatitude(): void {
    if (!Number.isFinite(this.latitude) || this.latitude < -90 || this.latitude > 90) {
      throw new RangeError('Latitude must be a finite value between -90 and 90 degrees.');
    }
  }

  private assertLongitude(): void {
    if (!Number.isFinite(this.longitude) || this.longitude < -180 || this.longitude > 180) {
      throw new RangeError('Longitude must be a finite value between -180 and 180 degrees.');
    }
  }

  private clampRatio(ratio: number): number {
    return Math.min(1, Math.max(0, ratio));
  }

  private toRadians(value: number): number {
    return (value * Math.PI) / 180;
  }
}
