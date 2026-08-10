export const FTMS_UUIDS = {
  service: 0x1826,
  feature: 0x2acc,
  indoorBikeData: 0x2ad2,
  controlPoint: 0x2ad9,
} as const;

export const INDOOR_BIKE_DATA_FLAGS = {
  moreData: 1 << 0,
  averageSpeed: 1 << 1,
  instantaneousCadence: 1 << 2,
  averageCadence: 1 << 3,
  totalDistance: 1 << 4,
  resistanceLevel: 1 << 5,
  instantaneousPower: 1 << 6,
  averagePower: 1 << 7,
  expendedEnergy: 1 << 8,
} as const;

export const FTMS_TARGET_FEATURES = {
  indoorBikeSimulationParameters: 1 << 13,
} as const;

export const FTMS_CONTROL_OPCODES = {
  requestControl: 0x00,
  startOrResume: 0x07,
  stopOrPause: 0x08,
  indoorBikeSimulationParameters: 0x11,
  responseCode: 0x80,
} as const;

export const FTMS_STOP_PAUSE_PARAMETERS = {
  stop: 0x01,
  pause: 0x02,
} as const;

export const FTMS_RESULT_CODES: Readonly<Record<number, string>> = {
  0x01: 'Success',
  0x02: 'Operation code not supported',
  0x03: 'Invalid parameter',
  0x04: 'Operation failed',
  0x05: 'Control not permitted',
};
