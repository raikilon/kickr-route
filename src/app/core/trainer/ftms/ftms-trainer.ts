import { Injectable } from '@angular/core';
import { fromEvent, Subject, Subscription } from 'rxjs';
import { TrainerEnvironment } from '../trainer-environment';
import { IndoorBikeData, TrainerTelemetry } from '../trainer-telemetry';
import { Trainer, TrainerConnection } from '../trainer';
import { FtmsControlPoint } from './ftms-control-point';
import { FTMS_TARGET_FEATURES, FTMS_UUIDS } from './ftms.constants';
import { IndoorBikeDataPacket } from './indoor-bike-data-packet';
import { TrainerSimulationController } from './trainer-simulation-controller';

@Injectable({ providedIn: 'root' })
export class FtmsTrainer implements Trainer {
  private readonly telemetrySubject = new Subject<TrainerTelemetry>();
  private readonly disconnectedSubject = new Subject<void>();
  private readonly errorSubject = new Subject<Error>();
  private subscriptions = new Subscription();
  private device: BluetoothDevice | null = null;
  private controlPoint: FtmsControlPoint | null = null;
  private simulationController: TrainerSimulationController | null = null;
  private environment = TrainerEnvironment.default;
  private currentGradientPercent = 0;
  private controlGranted = false;
  private gradeControlSupported = false;
  private controlling = false;
  private intentionalDisconnect = false;

  readonly telemetry$ = this.telemetrySubject.asObservable();
  readonly disconnected$ = this.disconnectedSubject.asObservable();
  readonly errors$ = this.errorSubject.asObservable();

  async connect(): Promise<TrainerConnection> {
    this.resetResources();
    this.intentionalDisconnect = false;
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [FTMS_UUIDS.service] }],
      });
      this.device = device;
      this.observeDisconnection(device);
      const service = await this.connectFitnessMachineService(device);
      await this.observeIndoorBikeData(service);
      this.gradeControlSupported = await this.readSimulationSupport(service);
      return await this.connectControlPoint(service, device.name ?? 'FTMS trainer');
    } catch (error) {
      this.intentionalDisconnect = true;
      this.device?.gatt?.disconnect();
      this.resetResources();
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
    if (!this.device) {
      return;
    }
    try {
      await this.stop();
    } finally {
      this.intentionalDisconnect = true;
      this.device.gatt?.disconnect();
      this.resetResources();
    }
  }

  private async connectFitnessMachineService(
    device: BluetoothDevice,
  ): Promise<BluetoothRemoteGATTService> {
    const server = await device.gatt?.connect();
    if (!server) {
      throw new Error('The selected trainer does not expose a Bluetooth GATT server.');
    }
    return server.getPrimaryService(FTMS_UUIDS.service);
  }

  private observeDisconnection(device: BluetoothDevice): void {
    this.subscriptions.add(
      fromEvent(device, 'gattserverdisconnected').subscribe(() => this.handleDisconnection()),
    );
  }

  private async observeIndoorBikeData(service: BluetoothRemoteGATTService): Promise<void> {
    const characteristic = await service.getCharacteristic(FTMS_UUIDS.indoorBikeData);
    await characteristic.startNotifications();
    this.subscriptions.add(
      fromEvent<Event>(characteristic, 'characteristicvaluechanged').subscribe((event) =>
        this.decodeTelemetry(event),
      ),
    );
  }

  private async readSimulationSupport(service: BluetoothRemoteGATTService): Promise<boolean> {
    try {
      const feature = await service.getCharacteristic(FTMS_UUIDS.feature);
      const value = await feature.readValue();
      if (value.byteLength < 8) {
        return false;
      }
      const targetFeatures = value.getUint32(4, true);
      return (targetFeatures & FTMS_TARGET_FEATURES.indoorBikeSimulationParameters) !== 0;
    } catch {
      return false;
    }
  }

  private async connectControlPoint(
    service: BluetoothRemoteGATTService,
    deviceName: string,
  ): Promise<TrainerConnection> {
    const characteristic = await this.findControlPoint(service);
    if (!characteristic) {
      return {
        deviceName,
        controlState: 'telemetry-only',
        gradeControlSupported: false,
        controlError: null,
      };
    }
    this.controlPoint = new FtmsControlPoint(characteristic);
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

  private async findControlPoint(
    service: BluetoothRemoteGATTService,
  ): Promise<BluetoothRemoteGATTCharacteristic | null> {
    try {
      return await service.getCharacteristic(FTMS_UUIDS.controlPoint);
    } catch {
      return null;
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
    this.subscriptions.add(
      this.simulationController.errors$.subscribe((error) => this.errorSubject.next(error)),
    );
  }

  private decodeTelemetry(event: Event): void {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) {
      return;
    }
    try {
      const indoorBikeData = new IndoorBikeDataPacket(value).decode();
      this.telemetrySubject.next(this.normalizeTelemetry(indoorBikeData));
    } catch (error) {
      this.errorSubject.next(this.asError(error));
    }
  }

  private normalizeTelemetry(indoorBikeData: IndoorBikeData): TrainerTelemetry {
    return {
      timestamp: performance.now(),
      speedKph: indoorBikeData.speedKph,
      cadenceRpm: indoorBikeData.cadenceRpm,
      powerWatts: indoorBikeData.powerWatts,
    };
  }

  private handleDisconnection(): void {
    const wasUnexpected = !this.intentionalDisconnect;
    this.resetResources();
    if (wasUnexpected) {
      this.disconnectedSubject.next();
    }
  }

  private resetResources(): void {
    this.subscriptions.unsubscribe();
    this.subscriptions = new Subscription();
    this.simulationController?.dispose();
    this.controlPoint?.dispose();
    this.simulationController = null;
    this.controlPoint = null;
    this.device = null;
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
