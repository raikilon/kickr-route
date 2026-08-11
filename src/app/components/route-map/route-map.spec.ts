import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RideService } from '../../core/ride/ride.service';
import { MapLibreRouteRenderer } from './rendering/maplibre-route-renderer';
import { RouteMap } from './route-map';

describe('RouteMap', () => {
  const ride = {
    telemetry: signal({
      timestamp: 0,
      powerWatts: 248,
      cadenceRpm: 86,
      speedKph: 32.4,
    }),
    currentGradientPercent: signal(6.2),
    completionPercentage: signal(42.1),
    distanceMeters: signal(12_340),
    elapsedSeconds: signal(3_661),
  };
  const renderer = {
    destroy: vi.fn(),
    render: vi.fn(),
    resize: vi.fn(),
  };

  let fullscreenElement: Element | null;
  let requestFullscreen: ReturnType<typeof vi.fn<Element['requestFullscreen']>>;
  let exitFullscreen: ReturnType<typeof vi.fn<Document['exitFullscreen']>>;
  let fullscreenEnabledDescriptor: PropertyDescriptor | undefined;
  let fullscreenElementDescriptor: PropertyDescriptor | undefined;
  let exitFullscreenDescriptor: PropertyDescriptor | undefined;
  let requestFullscreenDescriptor: PropertyDescriptor | undefined;

  beforeEach(async () => {
    fullscreenElement = null;
    fullscreenEnabledDescriptor = Object.getOwnPropertyDescriptor(document, 'fullscreenEnabled');
    fullscreenElementDescriptor = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
    exitFullscreenDescriptor = Object.getOwnPropertyDescriptor(document, 'exitFullscreen');
    requestFullscreenDescriptor = Object.getOwnPropertyDescriptor(
      Element.prototype,
      'requestFullscreen',
    );
    Object.defineProperty(document, 'fullscreenEnabled', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    });
    requestFullscreen = vi.fn<Element['requestFullscreen']>(async () => {
      fullscreenElement = document.querySelector('.map-shell');
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    exitFullscreen = vi.fn<Document['exitFullscreen']>(async () => {
      fullscreenElement = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    Object.defineProperty(Element.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exitFullscreen,
    });
    vi.spyOn(MapLibreRouteRenderer, 'create').mockResolvedValue(
      renderer as unknown as MapLibreRouteRenderer,
    );
    await TestBed.configureTestingModule({
      imports: [RouteMap],
      providers: [{ provide: RideService, useValue: ride }],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreProperty(document, 'fullscreenEnabled', fullscreenEnabledDescriptor);
    restoreProperty(document, 'fullscreenElement', fullscreenElementDescriptor);
    restoreProperty(document, 'exitFullscreen', exitFullscreenDescriptor);
    restoreProperty(Element.prototype, 'requestFullscreen', requestFullscreenDescriptor);
  });

  it('enters fullscreen and shows compact live ride metrics', async () => {
    const fixture = TestBed.createComponent(RouteMap);
    fixture.detectChanges();
    await fixture.whenStable();

    const enterButton = findButton(fixture.nativeElement, 'Full screen route map');
    const mapButtons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        '.basemap-controls button',
      ),
      (button) => button.textContent?.trim(),
    );
    expect(enterButton).not.toBeNull();
    expect(mapButtons).toEqual(['Street', 'Satellite', '3D']);
    expect(enterButton?.textContent?.trim()).toBe('');
    expect(fixture.nativeElement.querySelector('.ride-metrics')).toBeNull();

    enterButton?.click();
    await Promise.resolve();
    fixture.detectChanges();

    const shell = fixture.nativeElement.querySelector('.map-shell');
    const metrics = fixture.nativeElement.querySelector('.ride-metrics');
    expect(requestFullscreen).toHaveBeenCalledOnce();
    expect(fullscreenElement).toBe(shell);
    expect(shell?.classList).toContain('fullscreen');
    expect(metrics?.textContent).toContain('248');
    expect(metrics?.textContent).toContain('86');
    expect(metrics?.textContent).toContain('32.4');
    expect(metrics?.textContent).toContain('6.2');
    expect(metrics?.textContent).toContain('12.34');
    expect(metrics?.textContent).toContain('42.1%');
    expect(metrics?.textContent).toContain('01:01:01');
    expect(renderer.resize).toHaveBeenCalled();
    expect(findButton(fixture.nativeElement, 'Exit full screen route map')).not.toBeNull();
  });

  it('exits fullscreen from the map control', async () => {
    const fixture = TestBed.createComponent(RouteMap);
    fixture.detectChanges();
    await fixture.whenStable();
    findButton(fixture.nativeElement, 'Full screen route map')?.click();
    await Promise.resolve();
    fixture.detectChanges();

    findButton(fixture.nativeElement, 'Exit full screen route map')?.click();
    await Promise.resolve();
    fixture.detectChanges();

    expect(exitFullscreen).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('.ride-metrics')).toBeNull();
  });

  it('updates when fullscreen is exited by the browser', async () => {
    const fixture = TestBed.createComponent(RouteMap);
    fixture.detectChanges();
    await fixture.whenStable();
    findButton(fixture.nativeElement, 'Full screen route map')?.click();
    await Promise.resolve();
    fixture.detectChanges();

    fullscreenElement = null;
    document.dispatchEvent(new Event('fullscreenchange'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.map-shell')?.classList).not.toContain(
      'fullscreen',
    );
    expect(fixture.nativeElement.querySelector('.ride-metrics')).toBeNull();
  });

  it('does not show a fullscreen control when the API is unavailable', async () => {
    Object.defineProperty(document, 'fullscreenEnabled', {
      configurable: true,
      value: false,
    });
    const fixture = TestBed.createComponent(RouteMap);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(findButton(fixture.nativeElement, 'Full screen route map')).toBeNull();
  });
});

function findButton(root: HTMLElement, label: string): HTMLButtonElement | null {
  return root.querySelector(`button[aria-label="${label}"]`);
}

function restoreProperty(
  target: object,
  property: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) {
    Object.defineProperty(target, property, descriptor);
    return;
  }
  Reflect.deleteProperty(target, property);
}
