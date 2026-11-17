import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { SubscriptionService } from './subscription.service';
import { environment } from '../../environments/environment';

describe('SubscriptionService refresh after checkout', () => {
  let service: SubscriptionService;
  let http: HttpTestingController;
  const url = `${environment.apiUrl}/subscription/my-subscription`;
  const subscription = (name: string) => ({ id: 1, status: 'active', plan: { name, displayName: name } });
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(SubscriptionService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('replaces a cached FREE plan with the paid plan during explicit verification', () => {
    service.getMySubscription().subscribe();
    http.expectOne(url).flush({ success: true, subscription: subscription('FREE') });
    service.getMySubscription(true).subscribe(sub => expect(sub.plan.name).toBe('PRO'));
    http.expectOne(url).flush({ success: true, subscription: subscription('PRO') });
    expect(service.isPro()).toBeTrue();
    service.getMySubscription().subscribe(sub => expect(sub.plan.name).toBe('PRO'));
    http.expectNone(url);
  });

  it('invalidates the old cached plan when the provider subscription is verified', () => {
    service.getMySubscription().subscribe();
    http.expectOne(url).flush({ success: true, subscription: subscription('FREE') });
    service.verifySubscription('preapproval').subscribe();
    http.expectOne(`${environment.apiUrl}/subscription/verify/preapproval`).flush({ active: true, plan: 'STARTER' });
    service.getMySubscription().subscribe(sub => expect(sub.plan.name).toBe('STARTER'));
    http.expectOne(url).flush({ success: true, subscription: subscription('STARTER') });
  });
});
