import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EventService } from './event.service';

describe('Public event cache and hydration', () => {
  let service: EventService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(EventService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); localStorage.removeItem('eventlife_explore_1_12'); });
  it('ignores stale persistent snapshots on initial loading', () => {
    localStorage.setItem('eventlife_explore_1_12', JSON.stringify({ expiresAt: Date.now() + 10000, data: [] }));
    service.obtenerEventos(12).subscribe(events => expect(events.length).toBe(1));
    http.expectOne(r => r.url.endsWith('/explore')).flush({ data: [{ id: 1, title: 'Actual' }] });
  });
  it('reuses requests within the TTL and refreshes after five minutes', fakeAsync(() => {
    service.obtenerEventos(12).subscribe(); http.expectOne(r => r.url.endsWith('/explore')).flush({ data: [] });
    service.obtenerEventos(12).subscribe(); http.expectNone(r => r.url.endsWith('/explore'));
    tick(300001); service.obtenerEventos(12).subscribe(); http.expectOne(r => r.url.endsWith('/explore')).flush({ data: [] });
  }));
});
