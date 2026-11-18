import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CheckoutComponent } from './checkout.component';
import { AuthService } from '../../services/auth.service';
import { EventService } from '../../services/event.service';
import { TicketService } from '../../services/ticket.service';
import { CouponService } from '../../services/coupon.service';
import { ToastService } from '../../services/toast.service';

describe('Checkout reservation feedback', () => {
  let fixture: ComponentFixture<CheckoutComponent>;
  beforeEach(async () => {
    sessionStorage.setItem('eventCart', JSON.stringify({ eventId: 1, items: [{ ticketTypeId: 2, quantity: 1 }] }));
    await TestBed.configureTestingModule({ imports: [CheckoutComponent], providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '1' }), queryParamMap: convertToParamMap({}) } } },
      { provide: AuthService, useValue: { ensureCurrentUser: () => of(null) } },
      { provide: EventService, useValue: { obtenerEvento: () => of({ id: 1, ticketTypes: [{ id: 2, name: 'General', price: 100, capacity: 20 }] }) } },
      { provide: TicketService, useValue: {} }, { provide: CouponService, useValue: {} },
      { provide: ToastService, useValue: {} }
    ] }).overrideComponent(CheckoutComponent, { set: { imports: [], template: '' } }).compileComponents();
    fixture = TestBed.createComponent(CheckoutComponent);
  });
  afterEach(() => { fixture.destroy(); sessionStorage.removeItem('eventCart'); });
  it('keeps buyer inputs enabled after ten minutes before initiating payment', fakeAsync(() => {
    fixture.detectChanges(); tick(601000);
    expect(fixture.componentInstance.formCheckout.enabled).toBeTrue();
    expect(fixture.componentInstance.showErrorMessage).toBeFalse();
  }));
});
