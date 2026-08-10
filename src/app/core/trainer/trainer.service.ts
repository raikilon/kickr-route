import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { DemoTrainer } from './demo/demo-trainer';
import { FtmsTrainer } from './ftms/ftms-trainer';
import { RidingPosture, TrainerEnvironment } from './trainer-environment';
import { TrainerConnectionState, TrainerControlState, TrainerMode } from './trainer-state';
import { TrainerTelemetry } from './trainer-telemetry';
import { Trainer, TrainerConnection } from './trainer';

@Injectable({ providedIn: 'root' })
export class TrainerService {
  private readonly ftmsTrainer = inject(FtmsTrainer);
  private readonly demoTrainer = inject(DemoTrainer);
  private readonly destroyRef = inject(DestroyRef);
  private readonly connectionStateSignal = signal<TrainerConnectionState>('disconnected');
  private readonly controlStateSignal = signal<TrainerControlState>('unavailable');
  private readonly controllingSignal = signal(false);
  private readonly modeSignal = signal<TrainerMode | null>(null);
  private readonly deviceNameSignal = signal<string | null>(null);
  private readonly telemetrySignal = signal<TrainerTelemetry | null>(null);
  private readonly environmentSignal = signal(TrainerEnvironment.default);
  private readonly errorSignal = signal<string | null>(null);
  private activeTrainer: Trainer | null = null;
  private activeConnection: TrainerConnection | null = null;
  private subscriptions = new Subscription();

  readonly connectionState = this.connectionStateSignal.asReadonly();
  readonly controlState = this.controlStateSignal.asReadonly();
  readonly isControlling = this.controllingSignal.asReadonly();
  readonly mode = this.modeSignal.asReadonly();
  readonly deviceName = this.deviceNameSignal.asReadonly();
  readonly telemetry = this.telemetrySignal.asReadonly();
  readonly environment = this.environmentSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly bluetoothSupported = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

  constructor() {
    const pageHide = () => void this.activeTrainer?.stop();
    globalThis.addEventListener?.('pagehide', pageHide);
    this.destroyRef.onDestroy(() => {
      globalThis.removeEventListener?.('pagehide', pageHide);
      this.subscriptions.unsubscribe();
    });
  }

  async connectFtms(): Promise<void> {
    if (!this.bluetoothSupported) {
      this.fail(
        'Web Bluetooth is unavailable. Use Chrome or Edge on a compatible desktop or Android device over HTTPS.',
      );
      return;
    }
    await this.connectTrainer(this.ftmsTrainer, 'ftms');
  }

  async connectDemo(): Promise<void> {
    await this.connectTrainer(this.demoTrainer, 'demo');
  }

  async startOrResume(): Promise<void> {
    if (!this.activeTrainer || this.connectionStateSignal() !== 'connected') {
      return;
    }
    try {
      await this.activeTrainer.startOrResume();
      this.controllingSignal.set(this.activeConnection?.gradeControlSupported === true);
    } catch (error) {
      this.reportControlFailure(error, 'The trainer did not start.');
    }
  }

  async pause(): Promise<void> {
    if (!this.activeTrainer) {
      return;
    }
    try {
      await this.activeTrainer.pause();
    } catch (error) {
      this.errorSignal.set(this.errorMessage(error, 'The trainer did not acknowledge pause.'));
    }
    this.controllingSignal.set(false);
  }

  async stop(): Promise<void> {
    if (!this.activeTrainer) {
      return;
    }
    try {
      await this.activeTrainer.stop();
    } catch (error) {
      this.errorSignal.set(this.errorMessage(error, 'The trainer did not acknowledge stop.'));
    }
    this.controllingSignal.set(false);
  }

  setGradient(gradientPercent: number): void {
    this.activeTrainer?.setGradient(gradientPercent);
  }

  setWindSpeedKph(windSpeedKph: number): void {
    if (!Number.isFinite(windSpeedKph)) {
      return;
    }
    this.publishEnvironment(this.environmentSignal().withWindSpeed(windSpeedKph));
  }

  adjustWindSpeedKph(deltaKph: number): void {
    this.setWindSpeedKph(this.environmentSignal().windSpeedKph + deltaKph);
  }

  setRidingPosture(ridingPosture: RidingPosture): void {
    this.publishEnvironment(this.environmentSignal().withRidingPosture(ridingPosture));
  }

  async disconnect(): Promise<void> {
    const trainer = this.activeTrainer;
    if (!trainer) {
      return;
    }
    try {
      await trainer.disconnect();
    } catch (error) {
      this.errorSignal.set(
        this.errorMessage(error, 'The trainer could not be disconnected cleanly.'),
      );
    }
    this.resetState();
  }

  clearError(): void {
    this.errorSignal.set(null);
  }

  private async connectTrainer(trainer: Trainer, mode: TrainerMode): Promise<void> {
    if (!this.canConnect()) {
      return;
    }
    this.beginConnection(trainer, mode);
    try {
      const connection = await trainer.connect();
      this.publishConnection(connection);
    } catch (error) {
      this.resetState();
      this.fail(this.connectionErrorMessage(error));
    }
  }

  private canConnect(): boolean {
    const state = this.connectionStateSignal();
    return state === 'disconnected' || state === 'error';
  }

  private beginConnection(trainer: Trainer, mode: TrainerMode): void {
    this.resetState();
    this.activeTrainer = trainer;
    trainer.setEnvironment(this.environmentSignal());
    this.modeSignal.set(mode);
    this.connectionStateSignal.set('connecting');
    this.controlStateSignal.set('requesting');
    this.errorSignal.set(null);
    this.observeTrainer(trainer);
  }

  private observeTrainer(trainer: Trainer): void {
    this.subscriptions.add(
      trainer.telemetry$.subscribe((telemetry) => this.telemetrySignal.set(telemetry)),
    );
    this.subscriptions.add(
      trainer.disconnected$.subscribe(() => this.handleUnexpectedDisconnection()),
    );
    this.subscriptions.add(trainer.errors$.subscribe((error) => this.handleTrainerError(error)));
  }

  private publishEnvironment(environment: TrainerEnvironment): void {
    this.environmentSignal.set(environment);
    this.activeTrainer?.setEnvironment(environment);
  }

  private publishConnection(connection: TrainerConnection): void {
    this.activeConnection = connection;
    this.deviceNameSignal.set(connection.deviceName);
    this.connectionStateSignal.set('connected');
    this.controlStateSignal.set(connection.controlState);
    if (connection.controlError) {
      this.errorSignal.set(connection.controlError);
    }
  }

  private handleUnexpectedDisconnection(): void {
    this.resetState();
    this.errorSignal.set('Trainer disconnected unexpectedly. The ride has been paused.');
  }

  private handleTrainerError(error: Error): void {
    this.controllingSignal.set(false);
    this.controlStateSignal.set('error');
    this.errorSignal.set(error.message);
  }

  private reportControlFailure(error: unknown, fallbackMessage: string): void {
    this.controllingSignal.set(false);
    this.controlStateSignal.set('error');
    this.errorSignal.set(this.errorMessage(error, fallbackMessage));
  }

  private resetState(): void {
    this.subscriptions.unsubscribe();
    this.subscriptions = new Subscription();
    this.activeTrainer = null;
    this.activeConnection = null;
    this.connectionStateSignal.set('disconnected');
    this.controlStateSignal.set('unavailable');
    this.controllingSignal.set(false);
    this.modeSignal.set(null);
    this.deviceNameSignal.set(null);
    this.telemetrySignal.set(null);
  }

  private fail(message: string): void {
    this.connectionStateSignal.set('error');
    this.controlStateSignal.set('unavailable');
    this.controllingSignal.set(false);
    this.errorSignal.set(message);
  }

  private connectionErrorMessage(error: unknown): string {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return 'No trainer was selected.';
    }
    return this.errorMessage(error, 'Could not connect to the trainer.');
  }

  private errorMessage(error: unknown, fallbackMessage: string): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return fallbackMessage;
  }
}
