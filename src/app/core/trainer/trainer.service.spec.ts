import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { DemoTrainer } from './demo/demo-trainer';
import { FtmsTrainer } from './ftms/ftms-trainer';
import { TrainerEnvironment } from './trainer-environment';
import { Trainer, TrainerConnection } from './trainer';
import { TrainerService } from './trainer.service';

class PendingTrainer implements Trainer {
  private readonly telemetrySubject = new Subject<never>();
  private readonly disconnectedSubject = new Subject<void>();
  private readonly errorSubject = new Subject<Error>();
  private readonly connectionPromise: Promise<TrainerConnection>;
  private resolveConnection!: (connection: TrainerConnection) => void;

  readonly telemetry$ = this.telemetrySubject.asObservable();
  readonly disconnected$ = this.disconnectedSubject.asObservable();
  readonly errors$ = this.errorSubject.asObservable();

  constructor() {
    this.connectionPromise = new Promise((resolve) => {
      this.resolveConnection = resolve;
    });
  }

  connect(): Promise<TrainerConnection> {
    return this.connectionPromise;
  }

  completeConnection(): void {
    this.resolveConnection({
      deviceName: 'Late trainer',
      controlState: 'ready',
      gradeControlSupported: true,
      controlError: null,
    });
  }

  disconnectUnexpectedly(): void {
    this.disconnectedSubject.next();
  }

  startOrResume(): Promise<void> {
    return Promise.resolve();
  }

  pause(): Promise<void> {
    return Promise.resolve();
  }

  stop(): Promise<void> {
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    return Promise.resolve();
  }

  setEnvironment(environment: TrainerEnvironment): void {
    void environment;
  }

  setGradient(gradientPercent: number): void {
    void gradientPercent;
  }
}

describe('TrainerService', () => {
  it('ignores a connection that completes after an unexpected disconnect', async () => {
    const trainer = new PendingTrainer();
    TestBed.configureTestingModule({
      providers: [
        { provide: DemoTrainer, useValue: trainer },
        { provide: FtmsTrainer, useValue: trainer },
      ],
    });
    const service = TestBed.inject(TrainerService);

    const connection = service.connectDemo();
    trainer.disconnectUnexpectedly();
    trainer.completeConnection();
    await connection;

    expect(service.connectionState()).toBe('disconnected');
    expect(service.deviceName()).toBeNull();
    expect(service.error()).toBe('Trainer disconnected unexpectedly. The ride has been paused.');
  });
});
