import { GpxParseError, GpxParser } from './gpx-parser';

describe('GpxParser', () => {
  const service = new GpxParser();

  it('parses standard GPX track segments', () => {
    const route = service.parse(`
      <gpx xmlns="http://www.topografix.com/GPX/1/1">
        <trk><name>Test climb</name><trkseg>
          <trkpt lat="45" lon="7"><ele>100</ele></trkpt>
          <trkpt lat="45.001" lon="7.001"><ele>110</ele></trkpt>
        </trkseg></trk>
      </gpx>
    `);
    expect(route.name).toBe('Test climb');
    expect(route.segments).toHaveLength(1);
    expect(route.points).toHaveLength(2);
    expect(route.totalDistanceMeters).toBeGreaterThan(100);
  });

  it('falls back to GPX route points', () => {
    const route = service.parse(`
      <gpx><rte><name>Road route</name>
        <rtept lat="45" lon="7" />
        <rtept lat="45.001" lon="7.001" />
      </rte></gpx>
    `);
    expect(route.name).toBe('Road route');
    expect(route.hasElevation).toBe(false);
    expect(route.points.every((routePoint) => routePoint.gradientPercent === 0)).toBe(true);
  });

  it('interpolates incomplete elevation and adds a warning', () => {
    const route = service.parse(`
      <gpx><trk><trkseg>
        <trkpt lat="45" lon="7"><ele>100</ele></trkpt>
        <trkpt lat="45.001" lon="7.001" />
        <trkpt lat="45.002" lon="7.002"><ele>120</ele></trkpt>
      </trkseg></trk></gpx>
    `);
    expect(route.points[1].elevationMeters).not.toBeNull();
    expect(route.warnings).toHaveLength(1);
  });

  it('rejects malformed XML and invalid coordinates', () => {
    expect(() => service.parse('<gpx><trk>')).toThrow(GpxParseError);
    expect(() =>
      service.parse('<gpx><rte><rtept lat="91" lon="0"/><rtept lat="0" lon="1"/></rte></gpx>'),
    ).toThrow(/latitude/i);
  });
});
