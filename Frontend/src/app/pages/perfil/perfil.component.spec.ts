import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { PerfilComponent } from './perfil.component';
import { HeaderComponent } from '../../components/header/header.component';
import { AuthService } from '../../services/auth.service';
import { EventService } from '../../services/event.service';
import { SubscriptionService } from '../../services/subscription.service';
import { PaymentService } from '../../services/payment.service';
import { ToastService } from '../../services/toast.service';

@Component({ selector: 'app-header', standalone: true, template: '' })
class HeaderStub {}

describe('Profile subscription display', () => {
  const plans = [{ id: 2, name: 'STARTER', monthlyPrice: 3499 }, { id: 3, name: 'PRO', monthlyPrice: 8999 }];
  function setup(name: string) {
    const subscriptionService = { getMySubscription: jasmine.createSpy().and.returnValue(of({ status: 'active', currentPeriodEnd: '2026-11-02', plan: { name, displayName: `Plan ${name}` } })), getPlans: () => of(plans) };
    TestBed.configureTestingModule({ imports: [PerfilComponent], providers: [provideRouter([]),
      { provide: AuthService, useValue: { ensureCurrentUser: () => of({ id: 1, roles: ['organizer'] }) } },
      { provide: EventService, useValue: { obtenerEventosUsuario: () => of([]) } },
      { provide: SubscriptionService, useValue: subscriptionService },
      { provide: PaymentService, useValue: { getMpStatus: () => of({ connected: false, sandboxReady: true }) } },
      { provide: ToastService, useValue: { error: jasmine.createSpy() } }
    ] }).overrideComponent(PerfilComponent, { remove: { imports: [HeaderComponent] }, add: { imports: [HeaderStub] } });
    const fixture = TestBed.createComponent(PerfilComponent);
    fixture.detectChanges();
    return { fixture, subscriptionService };
  }

  it('renders the active PRO card and reloads subscription data', () => {
    const { fixture, subscriptionService } = setup('PRO');
    expect(subscriptionService.getMySubscription).toHaveBeenCalledWith(true);
    expect(fixture.nativeElement.textContent).toContain('Plan PRO');
    expect(fixture.nativeElement.textContent).toContain('Cancelar suscripción');
  });

  it('shows STARTER honestly and selects PRO explicitly for the PRO upgrade', () => {
    const { fixture } = setup('STARTER');
    expect(fixture.nativeElement.textContent).toContain('Plan STARTER');
    fixture.componentInstance.goToUpgrade();
    expect(fixture.componentInstance.selectedPlan?.id).toBe(3);
  });
});
