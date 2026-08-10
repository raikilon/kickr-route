export type TrainerMode = 'ftms' | 'demo';
export type TrainerConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
export type TrainerControlState =
  'unavailable' | 'requesting' | 'ready' | 'telemetry-only' | 'error';
