import { INDOOR_BIKE_DATA_FLAGS } from './ftms.constants';
import { FtmsPacketError, IndoorBikeDataPacket } from './indoor-bike-data-packet';

describe('IndoorBikeDataPacket', () => {
  it('decodes mandatory instantaneous speed when More Data is clear', () => {
    const data = new DataView(Uint8Array.from([0, 0, 0xc4, 0x09]).buffer);
    expect(new IndoorBikeDataPacket(data).decode()).toEqual({ speedKph: 25 });
  });

  it('decodes cadence, distance, and signed power', () => {
    const flags =
      INDOOR_BIKE_DATA_FLAGS.instantaneousCadence |
      INDOOR_BIKE_DATA_FLAGS.totalDistance |
      INDOOR_BIKE_DATA_FLAGS.instantaneousPower;
    const values = [flags & 0xff, flags >> 8, 0x10, 0x0e, 0xb4, 0x00, 0x39, 0x30, 0x00, 0x06, 0xff];
    const result = new IndoorBikeDataPacket(new DataView(Uint8Array.from(values).buffer)).decode();
    expect(result).toMatchObject({
      speedKph: 36,
      cadenceRpm: 90,
      totalDistanceMeters: 12_345,
      powerWatts: -250,
    });
  });

  it('honors More Data and decodes average-only fields in protocol order', () => {
    const flags =
      INDOOR_BIKE_DATA_FLAGS.moreData |
      INDOOR_BIKE_DATA_FLAGS.averageSpeed |
      INDOOR_BIKE_DATA_FLAGS.averageCadence |
      INDOOR_BIKE_DATA_FLAGS.averagePower;
    const values = [flags & 0xff, flags >> 8, 0xc4, 0x09, 0xa0, 0x00, 0xfa, 0x00];
    const result = new IndoorBikeDataPacket(new DataView(Uint8Array.from(values).buffer)).decode();
    expect(result.speedKph).toBeUndefined();
    expect(result).toMatchObject({
      averageSpeedKph: 25,
      averageCadenceRpm: 80,
      averagePowerWatts: 250,
    });
  });

  it('rejects notifications shorter than their flags indicate', () => {
    const flags = INDOOR_BIKE_DATA_FLAGS.instantaneousPower;
    const data = new DataView(Uint8Array.from([flags, 0, 0, 0]).buffer);
    expect(() => new IndoorBikeDataPacket(data).decode()).toThrow(FtmsPacketError);
  });

  it('accepts and consumes expended energy without exposing its values', () => {
    const flags = INDOOR_BIKE_DATA_FLAGS.moreData | INDOOR_BIKE_DATA_FLAGS.expendedEnergy;
    const values = [flags & 0xff, flags >> 8, 0x7b, 0x00, 0xc8, 0x01, 0x05];

    expect(new IndoorBikeDataPacket(new DataView(Uint8Array.from(values).buffer)).decode()).toEqual(
      {},
    );
  });

  it('rejects truncated expended energy data', () => {
    const flags = INDOOR_BIKE_DATA_FLAGS.moreData | INDOOR_BIKE_DATA_FLAGS.expendedEnergy;
    const values = [flags & 0xff, flags >> 8, 0x7b, 0x00, 0xc8, 0x01];
    const packet = new IndoorBikeDataPacket(new DataView(Uint8Array.from(values).buffer));

    expect(() => packet.decode()).toThrow(FtmsPacketError);
  });
});
