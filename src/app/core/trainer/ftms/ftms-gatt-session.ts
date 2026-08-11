import { fromEvent, Subject, Subscription } from 'rxjs';
import { TrainerTelemetry } from '../trainer-telemetry';
import { FtmsControlPoint } from './ftms-control-point';
import { FTMS_TARGET_FEATURES, FTMS_UUIDS } from './ftms.constants';
import { IndoorBikeDataPacket } from './indoor-bike-data-packet';

export interface FtmsGattConnection {
  readonly deviceName: string;
  readonly controlPoint: FtmsControlPoint | null;
  readonly gradeControlSupported: boolean;
}

export class FtmsGattSession {
  private readonly telemetrySubject = new Subject<TrainerTelemetry>();
  private readonly disconnectedSubject = new Subject<void>();
  private readonly errorSubject = new Subject<Error>();
  private subscriptions = new Subscription();
  private device: BluetoothDevice | null = null;
  private controlPoint: FtmsControlPoint | null = null;
  private intentionalDisconnect = false;

  readonly telemetry$ = this.telemetrySubject.asObservable();
  readonly disconnected$ = this.disconnectedSubject.asObservable();
  readonly errors$ = this.errorSubject.asObservable();

  constructor(private readonly bluetooth: Bluetooth | null = null) {}

  get connected(): boolean {
    return this.device !== null;
  }

  async connect(): Promise<FtmsGattConnection> {
    this.disconnect();
    this.intentionalDisconnect = false;
    try {
      const device = await this.browserBluetooth().requestDevice({
        filters: [{ services: [FTMS_UUIDS.service] }],
      });
      this.device = device;
      this.observeDisconnection(device);
      const service = await this.connectFitnessMachineService(device);
      await this.observeIndoorBikeData(service);
      const gradeControlSupported = await this.readSimulationSupport(service);
      this.controlPoint = await this.createControlPoint(service);
      return {
        deviceName: device.name ?? 'FTMS trainer',
        controlPoint: this.controlPoint,
        gradeControlSupported,
      };
    } catch (error) {
      this.intentionalDisconnect = true;
      this.device?.gatt?.disconnect();
      this.releaseResources();
      throw this.asError(error);
    }
  }

  disconnect(): void {
    if (!this.device) {
      return;
    }
    this.intentionalDisconnect = true;
    this.device.gatt?.disconnect();
    this.releaseResources();
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

  private async createControlPoint(
    service: BluetoothRemoteGATTService,
  ): Promise<FtmsControlPoint | null> {
    try {
      const characteristic = await service.getCharacteristic(FTMS_UUIDS.controlPoint);
      return new FtmsControlPoint(characteristic);
    } catch {
      return null;
    }
  }

  private decodeTelemetry(event: Event): void {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) {
      return;
    }
    try {
      const indoorBikeData = new IndoorBikeDataPacket(value).decode();
      this.telemetrySubject.next({
        timestamp: performance.now(),
        speedKph: indoorBikeData.speedKph,
        cadenceRpm: indoorBikeData.cadenceRpm,
        powerWatts: indoorBikeData.powerWatts,
      });
    } catch (error) {
      this.errorSubject.next(this.asError(error));
    }
  }

  private handleDisconnection(): void {
    const wasUnexpected = !this.intentionalDisconnect;
    this.releaseResources();
    if (!wasUnexpected) {
      return;
    }
    this.disconnectedSubject.next();
  }

  private releaseResources(): void {
    this.subscriptions.unsubscribe();
    this.subscriptions = new Subscription();
    this.controlPoint?.dispose();
    this.controlPoint = null;
    this.device = null;
  }

  private asError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }
    return new Error(String(error));
  }

  private browserBluetooth(): Bluetooth {
    if (this.bluetooth) {
      return this.bluetooth;
    }
    if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
      throw new Error('Web Bluetooth is unavailable.');
    }
    return navigator.bluetooth;
  }
}
