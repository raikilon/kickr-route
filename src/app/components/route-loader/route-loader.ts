import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouteImportService } from '../../core/route/gpx/route-import.service';
import { Route } from '../../core/route/route';

@Component({
  selector: 'app-route-loader',
  imports: [MatButtonModule, MatCardModule],
  templateUrl: './route-loader.html',
  styleUrl: './route-loader.scss',
})
export class RouteLoader implements OnInit {
  private readonly routeImport = inject(RouteImportService);
  readonly disabled = input(false);
  readonly currentRoute = input<Route | null>(null);
  readonly routeLoaded = output<Route>();
  readonly routeCleared = output<void>();

  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly fileActionLabel = computed(() => {
    if (this.loading()) {
      return 'Reading…';
    }
    if (this.currentRoute()) {
      return 'Replace GPX';
    }
    return 'Load GPX';
  });

  ngOnInit(): void {
    const restoredRoute = this.routeImport.restoreLatest();
    if (!restoredRoute) {
      return;
    }
    this.notice.set(restoredRoute.notice);
    this.routeLoaded.emit(restoredRoute.route);
  }

  async selectFile(event: Event): Promise<void> {
    const inputElement = event.target as HTMLInputElement;
    const file = inputElement.files?.[0];
    inputElement.value = '';
    if (!file) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const importedRoute = await this.routeImport.importFile(file);
      this.routeLoaded.emit(importedRoute.route);
      this.notice.set(importedRoute.notice);
    } catch (error) {
      this.error.set(this.readErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  forgetRoute(): void {
    if (this.disabled()) {
      return;
    }
    this.routeImport.forgetLatest();
    this.notice.set('Saved route removed from this browser.');
    this.error.set(null);
    this.routeCleared.emit();
  }

  private readErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return 'Could not read the GPX file.';
  }
}
