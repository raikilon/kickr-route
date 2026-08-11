import { RideTicker } from './ride-ticker';

describe('RideTicker', () => {
  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('publishes elapsed time every 250 milliseconds from a performance clock baseline', () => {
    const onTick = vi.fn();
    const ticker = new RideTicker(onTick);

    ticker.start();
    vi.advanceTimersByTime(750);

    expect(onTick).toHaveBeenCalledTimes(3);
    expect(onTick).toHaveBeenNthCalledWith(1, 250, 0.25);
    expect(onTick).toHaveBeenNthCalledWith(2, 500, 0.25);
    expect(onTick).toHaveBeenNthCalledWith(3, 750, 0.25);
  });

  it('flushes elapsed time before the next scheduled update', () => {
    const onTick = vi.fn();
    const ticker = new RideTicker(onTick);

    ticker.start();
    vi.advanceTimersByTime(100);
    const tick = ticker.flush();

    expect(tick).toEqual({ currentTime: 100, elapsedSeconds: 0.1 });
    expect(onTick).not.toHaveBeenCalled();
  });

  it('stops scheduled and explicit updates', () => {
    const onTick = vi.fn();
    const ticker = new RideTicker(onTick);

    ticker.start();
    ticker.stop();
    vi.advanceTimersByTime(500);
    const tick = ticker.flush();

    expect(onTick).not.toHaveBeenCalled();
    expect(tick).toBeNull();
  });

  it('resets its baseline when restarted', () => {
    const onTick = vi.fn();
    const ticker = new RideTicker(onTick);

    ticker.start();
    vi.advanceTimersByTime(100);
    ticker.start();
    vi.advanceTimersByTime(250);

    expect(onTick).toHaveBeenCalledOnce();
    expect(onTick).toHaveBeenCalledWith(350, 0.25);
  });

  it('never publishes a negative elapsed duration when the clock moves backwards', () => {
    const onTick = vi.fn();
    const ticker = new RideTicker(onTick);
    vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(50);

    ticker.start();
    const tick = ticker.flush();

    expect(tick).toEqual({ currentTime: 50, elapsedSeconds: 0 });
    expect(onTick).not.toHaveBeenCalled();
  });
});
