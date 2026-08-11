import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { TrainerEnvironment } from '../trainer-environment';
import { Trainer, TrainerConnection } from '../trainer';
import { FtmsControlPoint } from './ftms-control-point';
import { FtmsGattSession } from './ftms-gatt-session';
import { TrainerSimulationController } from './trainer-simulation-controller';

@Injectable({ providedIn: 'root' })
export class FtmsTrainer implements Trainer {
  private readonly gattSession = new FtmsGattSession();
  private readonly disconnectedSubject = new Subject<void>();
  private readonly errorSubject = new Subject<Error>();
  private controlPoint: FtmsControlPoint | null = null;
  private simulationController: TrainerSimulationController | null = null;
  private environment = TrainerEnvironment.default;
  private currentGradientPercent = 0;
  private controlGranted = false;
  private gradeControlSupported = false;
  private controlling = false;

  readonly telemetry$ = this.gattSession.telemetry$;
  readonly disconnected$ = this.disconnectedSubject.asObservable();
  readonly errors$ = this.errorSubject.asObservable();

  constructor() {
    this.gattSession.errors$.subscribe((error) => this.errorSubject.next(error));
    this.gattSession.disconnected$.subscribe(() => this.handleDisconnection());
  }

  async connect(): Promise<TrainerConnection> {
    this.resetControlState();
    try {
      const connection = await this.gattSession.connect();
      this.controlPoint = connection.controlPoint;
      this.gradeControlSupported = connection.gradeControlSupported;
      return await this.connectControlPoint(connection.deviceName);
    } catch (error) {
      this.resetControlState();
      throw this.asError(error);
    }
  }

  async startOrResume(): Promise<void> {
    if (!this.controlPoint || !this.controlGranted) {
      return;
    }
    await this.controlPoint.startOrResume();
    this.controlling = this.gradeControlSupported;
  }

  async pause(): Promise<void> {
    if (!this.controlPoint || !this.controlGranted) {
      this.controlling = false;
      return;
    }
    await this.simulationController?.neutralize();
    await this.controlPoint.pause();
    this.controlling = false;
  }

  async stop(): Promise<void> {
    if (!this.controlPoint || !this.controlGranted) {
      this.controlling = false;
      return;
    }
    await this.simulationController?.neutralize();
    await this.controlPoint.stop();
    this.controlling = false;
  }

  setEnvironment(environment: TrainerEnvironment): void {
    this.environment = environment;
    this.requestSimulationUpdate();
  }

  setGradient(gradientPercent: number): void {
    this.currentGradientPercent = gradientPercent;
    this.requestSimulationUpdate();
  }

  private requestSimulationUpdate(): void {
    if (!this.controlling || !this.simulationController) {
      return;
    }
    this.simulationController.request(this.currentGradientPercent, this.environment);
  }

  async disconnect(): Promise<void> {
    if (!this.gattSession.connected) {
      return;
    }
    try {
      await this.stop();
    } finally {
      this.gattSession.disconnect();
      this.resetControlState();
    }
  }

  private async connectControlPoint(deviceName: string): Promise<TrainerConnection> {
    if (!this.controlPoint) {
      return {
        deviceName,
        controlState: 'telemetry-only',
        gradeControlSupported: false,
        controlError: null,
      };
    }
    try {
      await this.controlPoint.open();
      await this.controlPoint.requestControl();
      this.controlGranted = true;
      this.createGradeController();
      return this.successfulConnection(deviceName);
    } catch (error) {
      return {
        deviceName,
        controlState: 'error',
        gradeControlSupported: false,
        controlError: `Trainer telemetry is available, but control was denied: ${this.asError(error).message}`,
      };
    }
  }

  private successfulConnection(deviceName: string): TrainerConnection {
    if (this.gradeControlSupported) {
      return {
        deviceName,
        controlState: 'ready',
        gradeControlSupported: true,
        controlError: null,
      };
    }
    return {
      deviceName,
      controlState: 'telemetry-only',
      gradeControlSupported: false,
      controlError: null,
    };
  }

  private createGradeController(): void {
    if (!this.controlPoint || !this.gradeControlSupported) {
      return;
    }
    this.simulationController = new TrainerSimulationController(this.controlPoint);
    this.simulationController.errors$.subscribe((error) => this.errorSubject.next(error));
  }

  private handleDisconnection(): void {
    this.resetControlState();
    this.disconnectedSubject.next();
  }

  private resetControlState(): void {
    this.simulationController?.dispose();
    this.simulationController = null;
    this.controlPoint = null;
    this.controlGranted = false;
    this.gradeControlSupported = false;
    this.controlling = false;
    this.currentGradientPercent = 0;
  }

  private asError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }
    return new Error(String(error));
  }
}
