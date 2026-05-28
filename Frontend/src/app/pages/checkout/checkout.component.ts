import { Component, inject, OnInit, OnDestroy, DestroyRef } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EventService } from '../../services/event.service';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TicketService } from '../../services/ticket.service';
import { HeaderComponent } from '../../components/header/header.component';
import { interval, Subscription } from 'rxjs';
import { TicketType } from '../../interfaces/event';
import { ToastService } from '../../services/toast.service';
import { DemoBannerComponent } from '../../components/demo-banner/demo-banner.component';
import { CouponService } from '../../services/coupon.service';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EventImageFallbackDirective } from '../../directives/event-image-fallback.directive';
import { AuthService } from '../../services/auth.service';
import { PHONE_PATTERN } from '../../utils/validation';

@Component({
    selector: 'app-checkout',
    imports: [CommonModule, ReactiveFormsModule, FormsModule, HeaderComponent, DemoBannerComponent, EventImageFallbackDirective, RouterLink],
    templateUrl: './checkout.component.html',
    styleUrls: ['./checkout.component.css']
})
export class CheckoutComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  public formBuild = inject(FormBuilder);
  private eventoService = inject(EventService);
  private ticketService = inject(TicketService);
  private toastService = inject(ToastService);
  private couponService = inject(CouponService);
  private destroyRef = inject(DestroyRef);
  private authService = inject(AuthService);
  isAuthenticated = false;

  timeLeft: number = 600; // 10 minutos en segundos
  timerDisplay: string = '10:00';
  private timerSubscription!: Subscription;

  private eventId: string | null = null;
  evento: any;
  ticketTypes: TicketType[] = [];
  eventProducts: any[] = [];
  cartItems: Array<{ ticketType: TicketType; quantity: number }> = [];
  extraCartItems: Array<{ eventProduct: any; quantity: number }> = [];

  total: number = 0;
  extraTotal: number = 0;
  loading = false;
  showSuccessMessage = false;
  showErrorMessage = false;
  errorMessageText = '';
  paymentStatus: 'idle' | 'processing' | 'success' | 'failure' = 'idle';

  baseAmount: number = 0;

  // Commission info from backend
  commissionPercent: number = 8;
  commissionAmount: number = 0;
  organizerPlanName: string = 'FREE';

  // Coupon state
  couponCode = '';
  couponLoading = false;
  appliedCoupon: { discountPercent: number; couponId: number } | null = null;
  couponError = '';
  discountAmount = 0;
  finalTotal = 0;
  serviceFeePercent = 12;
  minimumServiceFee = 0;
  serviceFeeAmount = 0;
  totalToPay = 0;

  // Promoter code
  promoterCode = '';
  promoterCodeError = '';
  promoterCodeFromUrl = false;

  public formCheckout: FormGroup = this.formBuild.group({
    firstname: [''],
    lastname: [''],
    email: [''],
    confirmEmail: [''],
    phone: [''],
    birth: ['']
  });

  ngOnInit(): void {
    this.eventId = this.route.snapshot.paramMap.get('id');

    if (!this.eventId || isNaN(Number(this.eventId)) || Number(this.eventId) <= 0) {
      this.router.navigate(['/']);
      return;
    }

    const promoCodeFromUrl = this.route.snapshot.queryParamMap.get('promo');
    if (promoCodeFromUrl) {
      this.promoterCode = promoCodeFromUrl;
      this.promoterCodeFromUrl = true;
    }

    const storedCart = typeof window !== 'undefined' ? window.sessionStorage.getItem('eventCart') : null;
    let parsedCart: any = null;
    try {
      parsedCart = storedCart ? JSON.parse(storedCart) : null;
    } catch { /* ignore */ }

    if (!parsedCart || parsedCart.eventId !== Number(this.eventId) || !Array.isArray(parsedCart.items) || parsedCart.items.length === 0) {
      this.router.navigate([`/events/${this.eventId}`]);
      return;
    }

    if (parsedCart.promoterCode && !this.promoterCode) {
      this.promoterCode = parsedCart.promoterCode;
    }

    this.authService.ensureCurrentUser().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(user => {
      this.isAuthenticated = !!user;
      this.loadEvent(parsedCart.items, parsedCart.extraItems || []);
    });

    this.startTimer();
  }

  private loadEvent(
    cartItemInputs: Array<{ ticketTypeId: number; quantity: number }>,
    extraItemInputs: Array<{ eventProductId: number; quantity: number }> = []
  ): void {
    if (!this.eventId) return;

    this.eventoService.obtenerEvento(Number(this.eventId)).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((evento) => {
      this.evento = evento;
      this.ticketTypes = evento.ticketTypes || [];
      this.eventProducts = evento.eventProducts || [];
      this.serviceFeePercent = Number(evento.checkoutPricing?.serviceFeePercent ?? 15);
      this.minimumServiceFee = Number(evento.checkoutPricing?.minimumServiceFee ?? 0);
      this.organizerPlanName = evento.checkoutPricing?.planName || this.organizerPlanName;
      this.configureBuyerValidators();

      this.cartItems = cartItemInputs
        .map(ci => {
          const tt = this.ticketTypes.find(t => t.id === ci.ticketTypeId);
          return tt ? { ticketType: tt, quantity: ci.quantity } : null;
        })
        .filter((x): x is { ticketType: TicketType; quantity: number } => !!x);

      this.extraCartItems = extraItemInputs
        .map(ei => {
          const ep = this.eventProducts.find((e: any) => e.id === ei.eventProductId);
          return ep ? { eventProduct: ep, quantity: ei.quantity } : null;
        })
        .filter((x): x is { eventProduct: any; quantity: number } => !!x);

      if (this.cartItems.length === 0) {
        this.router.navigate([`/events/${this.eventId}`]);
        return;
      }

      this.calculateTotal();
    });
  }

  get requiresBirthDate(): boolean {
    return !this.isAuthenticated && !!this.evento?.minAge && this.evento.minAge > 0;
  }

  private configureBuyerValidators() {
    const guestControls = ['firstname', 'lastname', 'email', 'confirmEmail', 'phone', 'birth'];

    guestControls.forEach((controlName) => {
      const control = this.formCheckout.get(controlName);
      if (!control) return;

      if (this.isAuthenticated) {
        control.clearValidators();
      } else {
        const validators = controlName === 'birth'
          ? (this.requiresBirthDate ? [Validators.required] : [])
          : controlName === 'phone'
            ? [Validators.required, Validators.pattern(PHONE_PATTERN)]
            : (controlName === 'email' || controlName === 'confirmEmail')
              ? [Validators.required, Validators.email]
              : [Validators.required];
        control.setValidators(validators);
      }

      control.updateValueAndValidity({ emitEvent: false });
    });
  }

  private getGuestBuyer() {
    if (this.isAuthenticated) {
      return null;
    }

    const firstname = String(this.formCheckout.get('firstname')?.value || '').trim();
    const lastname = String(this.formCheckout.get('lastname')?.value || '').trim();
    const email = String(this.formCheckout.get('email')?.value || '').trim().toLowerCase();
    const confirmEmail = String(this.formCheckout.get('confirmEmail')?.value || '').trim().toLowerCase();
    const phone = String(this.formCheckout.get('phone')?.value || '').trim();
    const birth = String(this.formCheckout.get('birth')?.value || '').trim();

    if (!firstname || !lastname || !email || !confirmEmail || !phone) {
      this.toastService.warning('Completa los datos del comprador para continuar.');
      return null;
    }

    if (email !== confirmEmail) {
      this.toastService.warning('Los correos no coinciden.');
      return null;
    }

    if (!PHONE_PATTERN.test(phone)) {
      this.toastService.warning('Ingresá un teléfono válido.');
      return null;
    }

    if (this.requiresBirthDate && !birth) {
      this.toastService.warning(`Este evento requiere validar la edad mínima de ${this.evento?.minAge} años.`);
      return null;
    }

    return {
      firstname,
      lastname,
      email,
      phone,
      ...(birth ? { birth } : {})
    };
  }

  ngOnDestroy(): void {
    if (this.timerSubscription) this.timerSubscription.unsubscribe();
  }

  startTimer() {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }
    this.timerSubscription = interval(1000).subscribe(() => {
      if (this.timeLeft > 0) {
        this.timeLeft--;
        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = this.timeLeft % 60;
        this.timerDisplay = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
      } else {
        this.showErrorMessage = true;
        this.formCheckout.disable();
      }
    });
  }

  get scarcityLabel(): { text: string, color: string } | null {
    const minStock = this.cartItems.reduce((min, ci) => {
      const stock = ci.ticketType.capacity - (ci.ticketType.soldCount || 0);
      return Math.min(min, stock);
    }, Infinity);
    if (minStock < 20) {
      return { text: '¡Solo quedan unas pocas!', color: 'text-red-600 bg-red-50 border-red-100' };
    }
    if (minStock < 100) {
      return { text: 'Alta demanda 🔥', color: 'text-orange-600 bg-orange-50 border-orange-100' };
    }
    return null;
  }

  calculateTotal() {
    // Client-side calculation mirrors backend logic so the user sees accurate
    // service fees before hitting "Pay". The backend remains the source of
    // truth and will override these values in the preference response.
    this.baseAmount = this.cartItems.reduce((sum, ci) => sum + (ci.ticketType.price * ci.quantity), 0);
    this.extraTotal = this.extraCartItems.reduce((sum, ei) => sum + (ei.eventProduct.eventPrice * ei.quantity), 0);
    this.total = this.baseAmount + this.extraTotal;

    const ticketBaseForDiscount = this.baseAmount;
    if (this.appliedCoupon) {
      this.discountAmount = Math.min(ticketBaseForDiscount, Math.round((ticketBaseForDiscount * this.appliedCoupon.discountPercent) / 100));
      this.finalTotal = ticketBaseForDiscount - this.discountAmount + this.extraTotal;
    } else {
      this.discountAmount = 0;
      this.finalTotal = this.total;
    }

    // Replicate backend service-fee calculation (fee is applied to ticket net only).
    const ticketNetAmount = Math.max(this.baseAmount - this.discountAmount, 0);
    let computedServiceFee = 0;
    if (ticketNetAmount > 0 && this.serviceFeePercent > 0) {
      const percentFee = Math.ceil((ticketNetAmount * this.serviceFeePercent) / 100);
      computedServiceFee = Math.max(percentFee, Math.ceil(this.minimumServiceFee || 0));
    }
    this.serviceFeeAmount = computedServiceFee;
    this.totalToPay = this.finalTotal + this.serviceFeeAmount;
  }

  applyCoupon() {
    if (!this.couponCode.trim()) {
      this.couponError = 'Ingresa un código de cupón';
      return;
    }

    this.couponLoading = true;
    this.couponError = '';

    // Use evento.id instead of eventId (route param) to ensure correct event
    const eventIdToUse = this.evento?.id || Number(this.eventId);
    this.couponService.validateCoupon(this.couponCode.trim(), eventIdToUse).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        if (result.valid) {
          this.appliedCoupon = {
            discountPercent: result.discountPercent!,
            couponId: result.couponId!
          };
          this.toastService.success(result.message);
          this.calculateTotal();
        } else {
          this.couponError = result.message;
        }
        this.couponLoading = false;
      },
      error: (err) => {
        this.couponError = err.error?.message || 'Cupón no válido';
        this.couponLoading = false;
      }
    });
  }

  removeCoupon() {
    this.appliedCoupon = null;
    this.couponCode = '';
    this.couponError = '';
    this.calculateTotal();
  }

  formatGuestPhoneNumber(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    let input = inputElement.value.replace(/\D/g, '');

    if (input.length > 4) {
      input = `${input.substring(0, 4)}-${input.substring(4, 10)}`;
    }

    inputElement.value = input;
    this.formCheckout.get('phone')?.setValue(input, { emitEvent: false });
  }

  comprarTickets() {
    this.showSuccessMessage = false;
    this.showErrorMessage = false;
    this.errorMessageText = '';
    this.paymentStatus = 'idle';

    if (!this.formCheckout.valid) {
      this.formCheckout.markAllAsTouched();
      this.toastService.warning('Revisá los datos del comprador para continuar.');
      return;
    }
    if (this.cartItems.length === 0) return;
    const guestBuyer = this.getGuestBuyer();
    if (!this.isAuthenticated && !guestBuyer) return;

    this.loading = true;
    this.paymentStatus = 'processing';

    if (this.eventId) {
      const items = this.cartItems.map(ci => ({
        ticketTypeId: ci.ticketType.id!,
        quantity: ci.quantity
      }));
      const extraItems = this.extraCartItems.map(ei => ({
        eventProductId: ei.eventProduct.id!,
        quantity: ei.quantity
      }));

      this.ticketService.comprarTicket({
        items,
        extraItems: extraItems.length > 0 ? extraItems : undefined,
        promoterCode: this.promoterCode || undefined,
        couponId: this.appliedCoupon?.couponId,
        couponCode: this.appliedCoupon ? this.couponCode.trim() : undefined,
        buyer: guestBuyer || undefined
      }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (response: any) => {
          if (response.init_point) {
            // Guardar información de comisión para mostrar en el checkout
            if (response.commission_info) {
              this.commissionPercent = response.commission_info.commission_percent;
              this.commissionAmount = response.commission_info.commission_amount;
              this.organizerPlanName = response.commission_info.plan_name;
            }
            if (response.pricing) {
              this.serviceFeePercent = response.pricing.service_fee_percent ?? this.serviceFeePercent;
              this.serviceFeeAmount = response.pricing.service_fee_amount ?? this.serviceFeeAmount;
              this.totalToPay = response.pricing.buyer_total_amount ?? this.totalToPay;
              this.finalTotal = response.pricing.total_amount ?? this.finalTotal;
            }
            
            try {
              const lastPurchase = {
                preferenceId: response.id,
                external_reference: response.external_reference,
                eventId: Number(this.eventId),
                items: this.cartItems.map(ci => ({ ticketTypeId: ci.ticketType.id, quantity: ci.quantity })),
                totalAmount: this.finalTotal,
                serviceFeeAmount: this.serviceFeeAmount,
                buyerTotalAmount: this.totalToPay,
                guestCheckout: !this.isAuthenticated,
                deliveryEmail: response.delivery_email || guestBuyer?.email || null,
                at: Date.now()
              };
              if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.setItem('lastPurchase', JSON.stringify(lastPurchase));
              }
            } catch { }
            window.location.href = response.init_point;
          } else {
            this.toastService.error('No se pudo iniciar el pago. Intenta nuevamente.');
            this.showErrorMessage = true;
            this.loading = false;
            this.paymentStatus = 'failure';
          }
        },
        error: (error) => {
          // Error interceptor will show toast, but we also set component state
          this.showErrorMessage = true;
          this.errorMessageText = error?.error?.message || error?.userMessage || 'No pudimos iniciar el pago.';
          this.loading = false;
          this.paymentStatus = 'failure';
        }
      });
    }
  }

}
