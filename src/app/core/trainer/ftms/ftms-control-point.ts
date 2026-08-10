import { fromEvent, Subscription } from 'rxjs';
import {
  FTMS_CONTROL_OPCODES,
  FTMS_RESULT_CODES,
  FTMS_STOP_PAUSE_PARAMETERS,
} from './ftms.constants';
import { TrainerEnvironment } from '../trainer-environment';
import { TrainerGrade } from '../trainer-grade';
import { IndoorBikeSimulationParameters } from './indoor-bike-simulation-parameters';

interface PendingCommand {
  readonly opcode: number;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
}

export class FtmsControlPoint {
  private notificationSubscription: Subscription | null = null;
  private pendingCommand: PendingCommand | null = null;
  private commandQueue: Promise<void> = Promise.resolve();

  constructor(private readonly characteristic: BluetoothRemoteGATTCharacteristic) {}

  async open(): Promise<void> {
    await this.characteristic.startNotifications();
    this.notificationSubscription = fromEvent<Event>(
      this.characteristic,
      'characteristicvaluechanged',
    ).subscribe((event) => this.handleResponse(event));
  }

  requestControl(): Promise<void> {
    return this.enqueue(Uint8Array.of(FTMS_CONTROL_OPCODES.requestControl));
  }

  startOrResume(): Promise<void> {
    return this.enqueue(Uint8Array.of(FTMS_CONTROL_OPCODES.startOrResume));
  }

  pause(): Promise<void> {
    return this.enqueue(
      Uint8Array.of(FTMS_CONTROL_OPCODES.stopOrPause, FTMS_STOP_PAUSE_PARAMETERS.pause),
    );
  }

  stop(): Promise<void> {
    return this.enqueue(
      Uint8Array.of(FTMS_CONTROL_OPCODES.stopOrPause, FTMS_STOP_PAUSE_PARAMETERS.stop),
    );
  }

  setSimulationParameters(grade: TrainerGrade, environment: TrainerEnvironment): Promise<void> {
    return this.enqueue(new IndoorBikeSimulationParameters(grade, environment).encode());
  }

  dispose(): void {
    this.notificationSubscription?.unsubscribe();
    this.notificationSubscription = null;
    this.rejectPendingCommand(new Error('Trainer control point was closed.'));
    this.commandQueue = Promise.resolve();
  }

  private enqueue(payload: Uint8Array): Promise<void> {
    const operation = this.commandQueue.then(() => this.execute(payload));
    this.commandQueue = operation.catch(() => undefined);
    return operation;
  }

  private execute(payload: Uint8Array): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommand = null;
        reject(new Error('The trainer did not acknowledge the FTMS command.'));
      }, 4_000);
      this.pendingCommand = { opcode: payload[0], resolve, reject, timeout };
      const buffer = Uint8Array.from(payload).buffer;
      this.characteristic
        .writeValueWithResponse(buffer)
        .catch((error: unknown) => this.handleWriteFailure(payload[0], timeout, reject, error));
    });
  }

  private handleResponse(event: Event): void {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!this.isResponseForPendingCommand(value)) {
      return;
    }
    const resultCode = value!.getUint8(2);
    const pendingCommand = this.pendingCommand!;
    this.pendingCommand = null;
    clearTimeout(pendingCommand.timeout);
    if (resultCode === 0x01) {
      pendingCommand.resolve();
      return;
    }
    pendingCommand.reject(new Error(this.resultMessage(resultCode)));
  }

  private isResponseForPendingCommand(value: DataView | undefined): boolean {
    if (!value || value.byteLength < 3 || !this.pendingCommand) {
      return false;
    }
    if (value.getUint8(0) !== FTMS_CONTROL_OPCODES.responseCode) {
      return false;
    }
    return value.getUint8(1) === this.pendingCommand.opcode;
  }

  private resultMessage(resultCode: number): string {
    const knownResult = FTMS_RESULT_CODES[resultCode];
    if (knownResult) {
      return `FTMS command failed: ${knownResult}.`;
    }
    return `FTMS command failed with unknown result 0x${resultCode.toString(16)}.`;
  }

  private handleWriteFailure(
    opcode: number,
    timeout: ReturnType<typeof setTimeout>,
    reject: (error: Error) => void,
    error: unknown,
  ): void {
    if (this.pendingCommand?.opcode === opcode) {
      this.pendingCommand = null;
      clearTimeout(timeout);
    }
    if (error instanceof Error) {
      reject(error);
      return;
    }
    reject(new Error(String(error)));
  }

  private rejectPendingCommand(error: Error): void {
    if (!this.pendingCommand) {
      return;
    }
    clearTimeout(this.pendingCommand.timeout);
    this.pendingCommand.reject(error);
    this.pendingCommand = null;
  }
}
