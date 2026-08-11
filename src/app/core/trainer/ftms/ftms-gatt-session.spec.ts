import { FTMS_TARGET_FEATURES, FTMS_UUIDS } from './ftms.constants';
import { FtmsGattSession } from './ftms-gatt-session';
import { FtmsPacketError } from './indoor-bike-data-packet';

class FakeGattCharacteristic extends EventTarget {
  value: DataView | undefined;

  readonly startNotifications = vi.fn(async (): Promise<BluetoothRemoteGATTCharacteristic> => {
    return this as unknown as BluetoothRemoteGATTCharacteristic;
  });

  readonly readValue = vi.fn(async (): Promise<DataView> => {
    if (this.value) {
      return this.value;
    }
    return new DataView(new ArrayBuffer(0));
  });

  notify(bytes: number[]): void {
    this.value = new DataView(Uint8Array.from(bytes).buffer);
    this.dispatchEvent(new Event('characteristicvaluechanged'));
  }
}

class FtmsGattTestRig {
  readonly indoorBikeData = new FakeGattCharacteristic();
  readonly feature = new FakeGattCharacteristic();
  readonly controlPoint = new FakeGattCharacteristic();
  readonly disconnect = vi.fn(() => {
    this.device.dispatchEvent(new Event('gattserverdisconnected'));
  });
  readonly requestDevice: ReturnType<typeof vi.fn<Bluetooth['requestDevice']>>;
  readonly bluetooth: Bluetooth;
  readonly device: BluetoothDevice;
  controlPointAvailable = true;

  constructor() {
    const featureValue = new DataView(new ArrayBuffer(8));
    featureValue.setUint32(4, FTMS_TARGET_FEATURES.indoorBikeSimulationParameters, true);
    this.feature.value = featureValue;

    const service = {
      getCharacteristic: vi.fn((uuid: BluetoothCharacteristicUUID) => this.getCharacteristic(uuid)),
    } as unknown as BluetoothRemoteGATTService;
    const server = {
      connect: vi.fn(async (): Promise<BluetoothRemoteGATTServer> => server),
      disconnect: this.disconnect,
      getPrimaryService: vi.fn(async (): Promise<BluetoothRemoteGATTService> => service),
    } as unknown as BluetoothRemoteGATTServer;
    this.device = Object.assign(new EventTarget(), {
      id: 'trainer-id',
      name: 'Test trainer',
      gatt: server,
    }) as BluetoothDevice;
    this.requestDevice = vi.fn(async (): Promise<BluetoothDevice> => this.device);
    this.bluetooth = {
      requestDevice: this.requestDevice,
    } as unknown as Bluetooth;
  }

  disableSimulationSupport(): void {
    this.feature.value = new DataView(new ArrayBuffer(8));
  }

  disconnectUnexpectedly(): void {
    this.device.dispatchEvent(new Event('gattserverdisconnected'));
  }

  private async getCharacteristic(
    uuid: BluetoothCharacteristicUUID,
  ): Promise<BluetoothRemoteGATTCharacteristic> {
    if (uuid === FTMS_UUIDS.indoorBikeData) {
      return this.indoorBikeData as unknown as BluetoothRemoteGATTCharacteristic;
    }
    if (uuid === FTMS_UUIDS.feature) {
      return this.feature as unknown as BluetoothRemoteGATTCharacteristic;
    }
    if (uuid === FTMS_UUIDS.controlPoint && this.controlPointAvailable) {
      return this.controlPoint as unknown as BluetoothRemoteGATTCharacteristic;
    }
    throw new Error('Characteristic unavailable.');
  }
}

describe('FtmsGattSession', () => {
  it('discovers simulation and control capabilities and decodes telemetry', async () => {
    const rig = new FtmsGattTestRig();
    const session = new FtmsGattSession(rig.bluetooth);
    const telemetry: { speedKph?: number }[] = [];
    session.telemetry$.subscribe((value) => telemetry.push(value));

    const connection = await session.connect();
    rig.indoorBikeData.notify([0, 0, 0xc4, 0x09]);

    expect(rig.requestDevice).toHaveBeenCalledWith({
      filters: [{ services: [FTMS_UUIDS.service] }],
    });
    expect(connection.deviceName).toBe('Test trainer');
    expect(connection.gradeControlSupported).toBe(true);
    expect(connection.controlPoint).not.toBeNull();
    expect(rig.indoorBikeData.startNotifications).toHaveBeenCalledOnce();
    expect(telemetry).toEqual([expect.objectContaining({ speedKph: 25 })]);
  });

  it('preserves telemetry-only mode when control and simulation are unavailable', async () => {
    const rig = new FtmsGattTestRig();
    rig.controlPointAvailable = false;
    rig.disableSimulationSupport();
    const session = new FtmsGattSession(rig.bluetooth);

    const connection = await session.connect();

    expect(connection.controlPoint).toBeNull();
    expect(connection.gradeControlSupported).toBe(false);
    expect(session.connected).toBe(true);
  });

  it('reports malformed notifications and cleans up after an unexpected disconnect', async () => {
    const rig = new FtmsGattTestRig();
    const session = new FtmsGattSession(rig.bluetooth);
    const errors: Error[] = [];
    const telemetry: { speedKph?: number }[] = [];
    let disconnections = 0;
    session.errors$.subscribe((error) => errors.push(error));
    session.telemetry$.subscribe((value) => telemetry.push(value));
    session.disconnected$.subscribe(() => (disconnections += 1));
    await session.connect();

    rig.indoorBikeData.notify([0, 0, 0]);
    rig.disconnectUnexpectedly();
    rig.indoorBikeData.notify([0, 0, 0xc4, 0x09]);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(FtmsPacketError);
    expect(disconnections).toBe(1);
    expect(session.connected).toBe(false);
    expect(telemetry).toEqual([]);
  });

  it('disconnects intentionally without publishing a disconnection', async () => {
    const rig = new FtmsGattTestRig();
    const session = new FtmsGattSession(rig.bluetooth);
    let disconnections = 0;
    session.disconnected$.subscribe(() => (disconnections += 1));
    await session.connect();

    session.disconnect();

    expect(rig.disconnect).toHaveBeenCalledOnce();
    expect(disconnections).toBe(0);
    expect(session.connected).toBe(false);
  });
});
