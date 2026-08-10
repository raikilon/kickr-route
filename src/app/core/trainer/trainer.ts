import { Observable } from 'rxjs';
import { TrainerEnvironment } from './trainer-environment';
import { TrainerTelemetry } from './trainer-telemetry';

export type TrainerControlState = 'ready' | 'telemetry-only' | 'error';

export interface TrainerConnection {
  readonly deviceName: string;
  readonly controlState: TrainerControlState;
  readonly gradeControlSupported: boolean;
  readonly controlError: string | null;
}

export interface Trainer {
  readonly telemetry$: Observable<TrainerTelemetry>;
  readonly disconnected$: Observable<void>;
  readonly errors$: Observable<Error>;

  connect(): Promise<TrainerConnection>;
  startOrResume(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  setEnvironment(environment: TrainerEnvironment): void;
  setGradient(gradientPercent: number): void;
  disconnect(): Promise<void>;
}
