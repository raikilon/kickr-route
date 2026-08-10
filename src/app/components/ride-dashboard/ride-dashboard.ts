import { Component, computed, inject } from '@angular/core';
import { RideService } from '../../core/ride/ride.service';
import { TrainerService } from '../../core/trainer/trainer.service';
import { DurationPipe } from '../../shared/duration.pipe';

@Component({
  selector: 'app-ride-dashboard',
  imports: [DurationPipe],
  templateUrl: './ride-dashboard.html',
  styleUrl: './ride-dashboard.scss',
})
export class RideDashboard {
  protected readonly ride = inject(RideService);
  protected readonly trainer = inject(TrainerService);
  protected readonly powerWatts = computed(() => this.ride.telemetry()?.powerWatts ?? 0);
  protected readonly cadenceRpm = computed(() => this.ride.telemetry()?.cadenceRpm ?? 0);
  protected readonly speedKph = computed(() => this.ride.telemetry()?.speedKph ?? 0);
}
