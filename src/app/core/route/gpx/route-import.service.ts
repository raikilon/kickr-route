import { inject, Injectable } from '@angular/core';
import { Route } from '../route';
import { GpxParser } from './gpx-parser';
import { RouteStorageService } from './route-storage.service';

export interface RouteImportResult {
  readonly route: Route;
  readonly notice: string;
}

@Injectable({ providedIn: 'root' })
export class RouteImportService {
  private readonly gpx = inject(GpxParser);
  private readonly storage = inject(RouteStorageService);

  restoreLatest(): RouteImportResult | null {
    const storedRoute = this.storage.loadLatest();
    if (!storedRoute) {
      return null;
    }
    try {
      return {
        route: this.gpx.parse(storedRoute.source, storedRoute.fileName),
        notice: 'Restored the latest route saved in this browser.',
      };
    } catch {
      this.storage.clear();
      return null;
    }
  }

  async importFile(file: File): Promise<RouteImportResult> {
    this.assertGpxFilename(file.name);
    const source = await file.text();
    const route = this.gpx.parse(source, file.name);
    const saved = this.storage.saveLatest(file.name, source);
    return {
      route,
      notice: this.persistenceNotice(saved),
    };
  }

  forgetLatest(): void {
    this.storage.clear();
  }

  private assertGpxFilename(fileName: string): void {
    if (!fileName.toLowerCase().endsWith('.gpx')) {
      throw new Error('Choose a file with the .gpx extension.');
    }
  }

  private persistenceNotice(saved: boolean): string {
    if (saved) {
      return 'Route loaded and saved locally for your next visit.';
    }
    return 'Route loaded, but browser storage could not save it for next time.';
  }
}
