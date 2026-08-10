import { INDOOR_BIKE_DATA_FLAGS } from './ftms.constants';
import { IndoorBikeData } from '../trainer-telemetry';

export class FtmsPacketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FtmsPacketError';
  }
}

class PacketCursor {
  private offset = 0;

  constructor(private readonly data: DataView) {}

  readUint8(): number {
    this.ensureAvailable(1);
    const value = this.data.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  readUint16(): number {
    this.ensureAvailable(2);
    const value = this.data.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  readInt16(): number {
    this.ensureAvailable(2);
    const value = this.data.getInt16(this.offset, true);
    this.offset += 2;
    return value;
  }

  readUint24(): number {
    const leastSignificantByte = this.readUint8();
    const middleByte = this.readUint8();
    const mostSignificantByte = this.readUint8();
    return leastSignificantByte + (middleByte << 8) + (mostSignificantByte << 16);
  }

  private ensureAvailable(length: number): void {
    if (this.offset + length > this.data.byteLength) {
      throw new FtmsPacketError(
        'Indoor Bike Data notification is shorter than its flags indicate.',
      );
    }
  }
}

export class IndoorBikeDataPacket {
  private readonly cursor: PacketCursor;
  private readonly flags: number;
  private readonly decoded: MutableIndoorBikeData = {};

  constructor(data: DataView) {
    this.cursor = new PacketCursor(data);
    this.flags = this.cursor.readUint16();
  }

  decode(): IndoorBikeData {
    this.decodeSpeed();
    this.decodeCadence();
    this.decodeDistanceAndResistance();
    this.decodePower();
    this.decodeEnergy();
    return this.decoded;
  }

  private decodeSpeed(): void {
    if (!this.hasFlag(INDOOR_BIKE_DATA_FLAGS.moreData)) {
      this.decoded.speedKph = this.cursor.readUint16() / 100;
    }
    if (this.hasFlag(INDOOR_BIKE_DATA_FLAGS.averageSpeed)) {
      this.decoded.averageSpeedKph = this.cursor.readUint16() / 100;
    }
  }

  private decodeCadence(): void {
    if (this.hasFlag(INDOOR_BIKE_DATA_FLAGS.instantaneousCadence)) {
      this.decoded.cadenceRpm = this.cursor.readUint16() / 2;
    }
    if (this.hasFlag(INDOOR_BIKE_DATA_FLAGS.averageCadence)) {
      this.decoded.averageCadenceRpm = this.cursor.readUint16() / 2;
    }
  }

  private decodeDistanceAndResistance(): void {
    if (this.hasFlag(INDOOR_BIKE_DATA_FLAGS.totalDistance)) {
      this.decoded.totalDistanceMeters = this.cursor.readUint24();
    }
    if (this.hasFlag(INDOOR_BIKE_DATA_FLAGS.resistanceLevel)) {
      this.decoded.resistanceLevel = this.cursor.readInt16() / 10;
    }
  }

  private decodePower(): void {
    if (this.hasFlag(INDOOR_BIKE_DATA_FLAGS.instantaneousPower)) {
      this.decoded.powerWatts = this.cursor.readInt16();
    }
    if (this.hasFlag(INDOOR_BIKE_DATA_FLAGS.averagePower)) {
      this.decoded.averagePowerWatts = this.cursor.readInt16();
    }
  }

  private decodeEnergy(): void {
    if (!this.hasFlag(INDOOR_BIKE_DATA_FLAGS.expendedEnergy)) {
      return;
    }
    this.decoded.totalEnergyKcal = this.cursor.readUint16();
    this.decoded.energyPerHourKcal = this.cursor.readUint16();
    this.decoded.energyPerMinuteKcal = this.cursor.readUint8();
  }

  private hasFlag(flag: number): boolean {
    return (this.flags & flag) !== 0;
  }
}

interface MutableIndoorBikeData {
  speedKph?: number;
  averageSpeedKph?: number;
  cadenceRpm?: number;
  averageCadenceRpm?: number;
  totalDistanceMeters?: number;
  resistanceLevel?: number;
  powerWatts?: number;
  averagePowerWatts?: number;
  totalEnergyKcal?: number;
  energyPerHourKcal?: number;
  energyPerMinuteKcal?: number;
}
