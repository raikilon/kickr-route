import { Injectable } from '@angular/core';

export interface StoredRoute {
  readonly fileName: string;
  readonly source: string;
  readonly savedAt: string;
}

const STORAGE_KEY = 'kickr-route:last-gpx';

@Injectable({ providedIn: 'root' })
export class RouteStorageService {
  loadLatest(): StoredRoute | null {
    try {
      const value = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (!value) {
        return null;
      }
      const parsed: unknown = JSON.parse(value);
      if (!this.isStoredRoute(parsed)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  saveLatest(fileName: string, source: string): boolean {
    try {
      const route: StoredRoute = { fileName, source, savedAt: new Date().toISOString() };
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(route));
      return true;
    } catch {
      return false;
    }
  }

  clear(): void {
    try {
      globalThis.localStorage?.removeItem(STORAGE_KEY);
    } catch {
      // Storage can be unavailable in privacy modes; clearing is best effort.
    }
  }

  private isStoredRoute(value: unknown): value is StoredRoute {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate['fileName'] === 'string' &&
      typeof candidate['source'] === 'string' &&
      typeof candidate['savedAt'] === 'string'
    );
  }
}
