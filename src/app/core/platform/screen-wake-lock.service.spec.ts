import { TestBed } from '@angular/core/testing';
import { ScreenWakeLockService } from './screen-wake-lock.service';

class FakeWakeLockSentinel extends EventTarget implements WakeLockSentinel {
  onrelease: ((this: WakeLockSentinel, event: Event) => unknown) | null = null;
  readonly type = 'screen';
  released = false;
  readonly release = vi.fn(async (): Promise<void> => {
    if (this.released) {
      return;
    }
    this.released = true;
    this.dispatchEvent(new Event('release'));
  });
}

describe('ScreenWakeLockService', () => {
  let request: ReturnType<typeof vi.fn<WakeLock['request']>>;
  let visibilityState: DocumentVisibilityState;
  let wakeLockDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    request = vi.fn<WakeLock['request']>();
    visibilityState = 'visible';
    wakeLockDescriptor = Object.getOwnPropertyDescriptor(navigator, 'wakeLock');
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    });
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilityState);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (wakeLockDescriptor) {
      Object.defineProperty(navigator, 'wakeLock', wakeLockDescriptor);
    } else {
      Reflect.deleteProperty(navigator, 'wakeLock');
    }
  });

  it('acquires and releases the screen wake lock', async () => {
    const sentinel = new FakeWakeLockSentinel();
    request.mockResolvedValue(sentinel);
    const service = TestBed.inject(ScreenWakeLockService);

    service.setRequired(true);
    await Promise.resolve();
    expect(request).toHaveBeenCalledWith('screen');

    service.setRequired(false);
    await Promise.resolve();
    expect(sentinel.release).toHaveBeenCalledOnce();
  });

  it('releases while hidden and reacquires when visible', async () => {
    const firstSentinel = new FakeWakeLockSentinel();
    const secondSentinel = new FakeWakeLockSentinel();
    request.mockResolvedValueOnce(firstSentinel).mockResolvedValueOnce(secondSentinel);
    const service = TestBed.inject(ScreenWakeLockService);

    service.setRequired(true);
    await Promise.resolve();
    visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(firstSentinel.release).toHaveBeenCalledOnce();

    visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('releases a delayed lock granted after it is no longer required', async () => {
    let resolveRequest!: (sentinel: WakeLockSentinel) => void;
    request.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const sentinel = new FakeWakeLockSentinel();
    const service = TestBed.inject(ScreenWakeLockService);

    service.setRequired(true);
    service.setRequired(false);
    resolveRequest(sentinel);
    await Promise.resolve();
    await Promise.resolve();

    expect(sentinel.release).toHaveBeenCalledOnce();
  });

  it('retries when visibility changes while a request is pending', async () => {
    let resolveFirstRequest!: (sentinel: WakeLockSentinel) => void;
    const firstSentinel = new FakeWakeLockSentinel();
    const secondSentinel = new FakeWakeLockSentinel();
    request
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstRequest = resolve;
          }),
      )
      .mockResolvedValueOnce(secondSentinel);
    const service = TestBed.inject(ScreenWakeLockService);

    service.setRequired(true);
    visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    resolveFirstRequest(firstSentinel);
    await Promise.resolve();
    await Promise.resolve();

    expect(firstSentinel.release).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('continues without failing when wake lock is unsupported or denied', async () => {
    Reflect.deleteProperty(navigator, 'wakeLock');
    const unsupportedService = TestBed.inject(ScreenWakeLockService);
    expect(() => unsupportedService.setRequired(true)).not.toThrow();

    TestBed.resetTestingModule();
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    });
    request.mockRejectedValue(new DOMException('Wake lock denied.', 'NotAllowedError'));
    const deniedService = TestBed.inject(ScreenWakeLockService);
    deniedService.setRequired(true);
    await Promise.resolve();

    expect(request).toHaveBeenCalledWith('screen');
  });
});
