import {TestBed,ComponentFixture} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {provideHttpClientTesting,HttpTestingController} from '@angular/common/http/testing';
import {ActivatedRoute,convertToParamMap,provideRouter} from '@angular/router';
import {BehaviorSubject,of} from 'rxjs';
import {CheckoutSuccessComponent} from './success.component';
import {AuthService} from '../../services/auth.service';
import {TicketService} from '../../services/ticket.service';
import {ToastService} from '../../services/toast.service';

describe('Purchase confirmation',()=>{
  let fixture:ComponentFixture<CheckoutSuccessComponent>;
  let tickets:jasmine.SpyObj<TicketService>;
  let http:HttpTestingController;
  beforeEach(async()=>{
    sessionStorage.removeItem('lastPurchase');
    tickets=jasmine.createSpyObj('TicketService',['getLastPurchase']);tickets.getLastPurchase.and.returnValue(of({status:'processing',tickets:[]}));
    await TestBed.configureTestingModule({imports:[CheckoutSuccessComponent],providers:[provideRouter([]),provideHttpClient(),provideHttpClientTesting(),
      {provide:ActivatedRoute,useValue:{snapshot:{queryParamMap:convertToParamMap({})}}},
      {provide:AuthService,useValue:{currentUser$:new BehaviorSubject(null),ensureCurrentUser:()=>of(null)}},
      {provide:TicketService,useValue:tickets},
      {provide:ToastService,useValue:jasmine.createSpyObj('ToastService',['warning','success','error','info'])}
    ]}).overrideComponent(CheckoutSuccessComponent,{set:{template:''}}).compileComponents();
    fixture=TestBed.createComponent(CheckoutSuccessComponent);http=TestBed.inject(HttpTestingController);
  });
  afterEach(()=>{fixture.destroy();http.verify({ignoreCancelled:true});sessionStorage.removeItem('lastPurchase');});
  it('does not confirm an old purchase when the current reference is missing',()=>{
    fixture.detectChanges();expect(fixture.componentInstance.loading).toBeFalse();expect(tickets.getLastPurchase).not.toHaveBeenCalled();
  });
  it('queries the exact current reference',()=>{
    sessionStorage.setItem('lastPurchase',JSON.stringify({external_reference:'current-order',guestCheckout:false}));fixture.detectChanges();
    (fixture.componentInstance as any).pollOnce();expect(tickets.getLastPurchase).toHaveBeenCalledWith('current-order');
  });
  it('uses checkout capability and cancels guest requests when destroyed',()=>{
    sessionStorage.setItem('lastPurchase',JSON.stringify({external_reference:'guest-order',guestCheckout:true,statusToken:'private-capability'}));fixture.detectChanges();
    (fixture.componentInstance as any).pollOnce();const request=http.expectOne(r=>r.url.includes('/payment/status?external_reference=guest-order'));
    expect(request.request.headers.get('X-Checkout-Token')).toBe('private-capability');fixture.destroy();expect(request.cancelled).toBeTrue();
  });
});
