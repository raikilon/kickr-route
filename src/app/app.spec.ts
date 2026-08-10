import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    window.history.replaceState({}, '', '/');
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
  });

  afterEach(() => window.history.replaceState({}, '', '/'));

  it('creates the public cycling dashboard without demo controls', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('kickr/route');
    expect(fixture.nativeElement.textContent).not.toContain('Use demo trainer');
  });

  it('shows demo controls on the test route', () => {
    window.history.replaceState({}, '', '/test');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Use demo trainer');
  });
});
