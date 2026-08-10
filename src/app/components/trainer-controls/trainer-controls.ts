import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RideService } from '../../core/ride/ride.service';
import { RidingPosture } from '../../core/trainer/trainer-environment';
import { TrainerService } from '../../core/trainer/trainer.service';

@Component({
  selector: 'app-trainer-controls',
  imports: [MatButtonModule, MatCardModule],
  templateUrl: './trainer-controls.html',
  styleUrl: './trainer-controls.scss',
})
export class TrainerControls {
  protected readonly trainer = inject(TrainerService);
  protected readonly ride = inject(RideService);
  protected readonly connectionLabel = computed(() => {
    switch (this.trainer.connectionState()) {
      case 'connecting':
        return 'Connecting';
      case 'connected':
        return this.trainer.deviceName() ?? 'Connected';
      case 'error':
        return 'Connection issue';
      default:
        return 'No trainer';
    }
  });

  protected readonly controlLabel = computed(() => {
    if (this.trainer.mode() === 'demo') {
      return 'Demo grade control';
    }
    switch (this.trainer.controlState()) {
      case 'requesting':
        return 'Requesting control';
      case 'ready':
        if (this.trainer.isControlling()) {
          return 'Grade control active';
        }
        return 'Grade control ready';
      case 'telemetry-only':
        return 'Telemetry only · grade unsupported';
      case 'error':
        return 'Control unavailable';
      default:
        return 'Control not requested';
    }
  });

  connect(): void {
    void this.trainer.connectFtms();
  }

  useDemo(): void {
    void this.trainer.connectDemo();
  }

  disconnect(): void {
    void this.trainer.disconnect();
  }

  adjustWindSpeed(deltaKph: number): void {
    this.trainer.adjustWindSpeedKph(deltaKph);
  }

  setWindSpeed(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    this.trainer.setWindSpeedKph(input.valueAsNumber);
  }

  setRidingPosture(ridingPosture: RidingPosture): void {
    this.trainer.setRidingPosture(ridingPosture);
  }

  start(): void {
    void this.ride.start();
  }

  pause(): void {
    void this.ride.pause();
  }

  resume(): void {
    void this.ride.resume();
  }

  finish(): void {
    void this.ride.finish();
  }
}
