import { Injectable } from '@angular/core';
import { GeoCoordinate } from '../geo-coordinate';
import { RouteProcessingPolicy } from '../route-processing-policy';
import { RawRoutePoint, RouteSegment } from '../route-segment';
import { Route } from '../route';

export class GpxParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GpxParseError';
  }
}

@Injectable({ providedIn: 'root' })
export class GpxParser {
  private readonly defaultPolicy = new RouteProcessingPolicy();

  parse(source: string, fallbackName = 'Untitled route', policy = this.defaultPolicy): Route {
    const document = this.parseDocument(source);
    const pointGroups = this.readPointGroups(document);
    const warnings: string[] = [];
    const rawSegments = this.readRawSegments(pointGroups, warnings);
    this.assertPointCount(rawSegments);
    const routeName = this.readRouteName(document, fallbackName);
    const segments = this.processSegments(rawSegments, policy);
    try {
      return new Route(routeName, segments, [...new Set(warnings)]);
    } catch (error) {
      throw new GpxParseError(this.readErrorMessage(error));
    }
  }

  private parseDocument(source: string): Document {
    const document = new DOMParser().parseFromString(source, 'application/xml');
    if (document.getElementsByTagName('parsererror').length > 0) {
      throw new GpxParseError('The selected file is not valid GPX XML.');
    }
    return document;
  }

  private readPointGroups(document: Document): Element[][] {
    const trackSegments = this.elements(document, 'trkseg');
    if (trackSegments.length > 0) {
      return trackSegments.map((segment) => this.elements(segment, 'trkpt'));
    }
    const routes = this.elements(document, 'rte');
    if (routes.length > 0) {
      return routes.map((route) => this.elements(route, 'rtept'));
    }
    throw new GpxParseError('No GPX track segments or route points were found.');
  }

  private readRawSegments(
    pointGroups: readonly Element[][],
    warnings: string[],
  ): RawRoutePoint[][] {
    const segments = pointGroups.map((points) => this.readRawSegment(points, warnings));
    return segments.filter((points) => points.length > 0);
  }

  private readRawSegment(points: readonly Element[], warnings: string[]): RawRoutePoint[] {
    return points.map((point, index) => this.readRawPoint(point, index, warnings));
  }

  private readRawPoint(element: Element, index: number, warnings: string[]): RawRoutePoint {
    const latitude = this.readCoordinateAttribute(element, 'lat', index);
    const longitude = this.readCoordinateAttribute(element, 'lon', index);
    const elevationMeters = this.readElevation(element, warnings);
    try {
      return {
        coordinate: new GeoCoordinate(latitude, longitude),
        elevationMeters,
      };
    } catch (error) {
      throw new GpxParseError(
        `Point ${index + 1} has invalid coordinates: ${this.readErrorMessage(error)}`,
      );
    }
  }

  private readCoordinateAttribute(element: Element, attributeName: string, index: number): number {
    const attribute = element.getAttribute(attributeName);
    if (attribute === null || attribute.trim() === '') {
      throw new GpxParseError(`Point ${index + 1} has a missing ${attributeName} coordinate.`);
    }
    const coordinate = Number(attribute);
    if (!Number.isFinite(coordinate)) {
      throw new GpxParseError(`Point ${index + 1} has an invalid ${attributeName} coordinate.`);
    }
    return coordinate;
  }

  private readElevation(element: Element, warnings: string[]): number | null {
    const elevationText = this.firstText(element, 'ele');
    if (elevationText === null) {
      warnings.push(
        'Some route points have no elevation. Missing values were interpolated when possible.',
      );
      return null;
    }
    const elevationMeters = Number(elevationText);
    if (!Number.isFinite(elevationMeters)) {
      warnings.push(
        'Some route points have invalid elevation. Missing values were interpolated when possible.',
      );
      return null;
    }
    return elevationMeters;
  }

  private assertPointCount(rawSegments: readonly RawRoutePoint[][]): void {
    const pointCount = rawSegments.reduce((total, segment) => total + segment.length, 0);
    if (pointCount < 2) {
      throw new GpxParseError('The GPX route must contain at least two points.');
    }
  }

  private readRouteName(document: Document, fallbackName: string): string {
    const trackName = this.firstText(this.elements(document, 'trk')[0], 'name');
    if (trackName) {
      return trackName;
    }
    const routeName = this.firstText(this.elements(document, 'rte')[0], 'name');
    if (routeName) {
      return routeName;
    }
    const metadataName = this.firstText(this.elements(document, 'metadata')[0], 'name');
    if (metadataName) {
      return metadataName;
    }
    const filename = fallbackName.replace(/\.gpx$/i, '').trim();
    if (filename) {
      return filename;
    }
    return 'Untitled route';
  }

  private processSegments(
    rawSegments: readonly RawRoutePoint[][],
    policy: RouteProcessingPolicy,
  ): RouteSegment[] {
    const segments: RouteSegment[] = [];
    let startDistanceMeters = 0;
    rawSegments.forEach((rawSegment, index) => {
      const segment = new RouteSegment(index, startDistanceMeters, rawSegment, policy);
      segments.push(segment);
      startDistanceMeters = segment.endDistanceMeters;
    });
    return segments;
  }

  private elements(parent: Document | Element | undefined, localName: string): Element[] {
    if (!parent) {
      return [];
    }
    return Array.from(parent.getElementsByTagNameNS('*', localName));
  }

  private firstText(parent: Element | undefined, localName: string): string | null {
    const value = this.elements(parent, localName)[0]?.textContent?.trim();
    if (!value) {
      return null;
    }
    return value;
  }

  private readErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return 'The GPX route could not be processed.';
  }
}
