import { DOCUMENT } from '@angular/common';
import { Component, computed, effect, inject } from '@angular/core';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ElevationProfile } from './components/elevation-profile/elevation-profile';
import { RideDashboard } from './components/ride-dashboard/ride-dashboard';
import { RideSummary, RideSummaryDialogData } from './components/ride-summary/ride-summary';
import { RouteLoader } from './components/route-loader/route-loader';
import { RouteMap } from './components/route-map/route-map';
import { TrainerControls } from './components/trainer-controls/trainer-controls';
import { RideService } from './core/ride/ride.service';
import { Route } from './core/route/route';

@Component({
  selector: 'app-root',
  imports: [
    ElevationProfile,
    MatDialogModule,
    RideDashboard,
    RouteLoader,
    RouteMap,
    TrainerControls,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly document = inject(DOCUMENT);
  private readonly dialog = inject(MatDialog);

  protected readonly ride = inject(RideService);
  protected readonly routeLocked = computed(() => !this.ride.canChangeRoute());
  protected readonly demoEnabled = this.isDemoRoute();
  private summaryDialog: MatDialogRef<RideSummary> | null = null;

  constructor() {
    effect(() => this.openRideSummary());
  }

  protected loadRoute(route: Route): void {
    this.ride.setRoute(route);
  }

  protected clearRoute(): void {
    this.ride.clearRoute();
  }

  private isDemoRoute(): boolean {
    const pathname = this.document.location.pathname;
    return pathname.endsWith('/test') || pathname.endsWith('/test/');
  }

  private openRideSummary(): void {
    const summary = this.ride.summary();
    if (!summary || this.summaryDialog) {
      return;
    }
    const data: RideSummaryDialogData = {
      summary,
      routeName: this.currentRouteName(),
    };
    this.summaryDialog = this.dialog.open(RideSummary, {
      data,
      width: '880px',
      maxWidth: 'calc(100vw - 2rem)',
      maxHeight: 'calc(100vh - 2rem)',
      disableClose: true,
      panelClass: 'ride-summary-dialog',
    });
    this.summaryDialog.afterClosed().subscribe(() => this.handleSummaryClosed());
  }

  private handleSummaryClosed(): void {
    this.summaryDialog = null;
    this.ride.dismissSummary();
  }

  private currentRouteName(): string {
    const route = this.ride.route();
    if (!route) {
      return 'Route';
    }
    return route.name;
  }
}
