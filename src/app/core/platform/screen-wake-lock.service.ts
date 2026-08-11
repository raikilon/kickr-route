import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ScreenWakeLockService {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private sentinel: WakeLockSentinel | null = null;
  private required = false;
  private requestPending = false;
  private requestId = 0;

  constructor() {
    this.document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.destroyRef.onDestroy(() => this.destroy());
  }

  setRequired(required: boolean): void {
    if (this.required === required) {
      return;
    }
    this.required = required;
    this.requestId += 1;
    if (required) {
      void this.acquire();
      return;
    }
    void this.release();
  }

  private readonly handleVisibilityChange = (): void => {
    if (this.document.visibilityState !== 'visible') {
      this.requestId += 1;
      void this.release();
      return;
    }
    if (this.required) {
      void this.acquire();
    }
  };

  private async acquire(): Promise<void> {
    if (!this.canAcquire()) {
      return;
    }
    const requestId = this.requestId;
    this.requestPending = true;
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      if (!this.canKeep(sentinel, requestId)) {
        await sentinel.release();
        return;
      }
      this.sentinel = sentinel;
      sentinel.addEventListener('release', () => this.handleRelease(sentinel), { once: true });
    } catch {
      // Wake lock can be denied by browser policy, low-power mode, or battery state.
    } finally {
      this.requestPending = false;
      if (this.required && requestId !== this.requestId) {
        void this.acquire();
      }
    }
  }

  private canAcquire(): boolean {
    if (!this.required || this.requestPending || this.sentinel) {
      return false;
    }
    if (this.document.visibilityState !== 'visible' || typeof navigator === 'undefined') {
      return false;
    }
    return 'wakeLock' in navigator;
  }

  private canKeep(sentinel: WakeLockSentinel, requestId: number): boolean {
    if (sentinel.released || requestId !== this.requestId || !this.required) {
      return false;
    }
    return this.document.visibilityState === 'visible';
  }

  private handleRelease(sentinel: WakeLockSentinel): void {
    if (this.sentinel === sentinel) {
      this.sentinel = null;
    }
  }

  private async release(): Promise<void> {
    const sentinel = this.sentinel;
    this.sentinel = null;
    if (sentinel && !sentinel.released) {
      try {
        await sentinel.release();
      } catch {
        // The platform may have already revoked the lock.
      }
    }
  }

  private destroy(): void {
    this.required = false;
    this.requestId += 1;
    this.document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    void this.release();
  }
}
