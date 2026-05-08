import { Component, inject, OnInit, OnDestroy, DestroyRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
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
    imports: [CommonModule, ReactiveFormsModule, FormsModule, HeaderComponent, DemoBannerComponent, EventImageFallbackDirective],
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

  ticketsRestantes: number = 100; // Será actualizado con el stock real del tipo

  private eventId: string | null = null;
  evento: any;
  ticketTypes: TicketType[] = [];
  selectedTicketType: TicketType | null = null;

  ticketQuantity: number = 1;
  total: number = 0;
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

  // Promoter code
  promoterCode = '';
  promoterCodeError = '';
  promoterCodeFromUrl = false; // Track if code came from URL

  public formCheckout: FormGroup = this.formBuild.group({
    ticketTypeId: ['', Validators.required],
    quantity: [1, [Validators.required, Validators.min(1)]],
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

    // Check for promoter code in URL query params
    const promoCodeFromUrl = this.route.snapshot.queryParamMap.get('promo');
    if (promoCodeFromUrl) {
      this.promoterCode = promoCodeFromUrl;
      this.promoterCodeFromUrl = true;
    }

    this.authService.ensureCurrentUser().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(user => {
      this.isAuthenticated = !!user;
      this.loadEvent();
    });

    // Escuchar cambios en el tipo de ticket
    this.formCheckout.get('ticketTypeId')?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(id => {
      this.onTicketTypeChange(Number(id));
    });

    // Iniciar el temporizador apenas carga el checkout
    this.startTimer();
  }

  private loadEvent(): void {
    if (!this.eventId) return;

    this.eventoService.obtenerEvento(Number(this.eventId)).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((evento) => {
      this.evento = evento;
      this.ticketTypes = evento.ticketTypes || [];
      this.configureBuyerValidators();

      // Auto-select first active ticket type
      if (this.ticketTypes.length > 0) {
        const firstActive = this.ticketTypes.find(t => t.status === 'active');
        if (firstActive) {
          this.formCheckout.patchValue({ ticketTypeId: firstActive.id });
          this.onTicketTypeChange(firstActive.id!);
        }
      } else {
        // Fallback for legacy events without ticketTypes (should not happen with new logic)
        this.selectedTicketType = {
          id: 0,
          name: 'Entrada General',
          price: evento.price || 0,
          capacity: evento.capacity || 100,
          status: 'active'
        };
        this.calculateTotal();
      }
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

  onTicketTypeChange(id: number) {
    this.selectedTicketType = this.ticketTypes.find(t => t.id == id) || null;
    if (this.selectedTicketType) {
      this.ticketsRestantes = this.selectedTicketType.capacity - (this.selectedTicketType.soldCount || 0);
      this.calculateTotal();
    }
  }

  ngOnDestroy(): void {
    // Limpiar timer al salir
    if (this.timerSubscription) this.timerSubscription.unsubscribe();
  }

  // 1. LOGICA TEMPORIZADOR
  startTimer() {
    this.timerSubscription = interval(1000).subscribe(() => {
      if (this.timeLeft > 0) {
        this.timeLeft--;
        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = this.timeLeft % 60;
        this.timerDisplay = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
      } else {
        // Tiempo agotado: Redirigir o mostrar alerta
        this.showErrorMessage = true; // Reusamos tu variable de error
        this.formCheckout.disable(); // Deshabilitar compra
      }
    });
  }

  // 2. LOGICA DE ESCASEZ (Getter inteligente)
  get scarcityLabel(): { text: string, color: string } | null {
    // Si quedan menos de 20 entradas, mostramos alerta roja
    if (this.ticketsRestantes < 20) {
      return { text: '¡Solo quedan unas pocas!', color: 'text-red-600 bg-red-50 border-red-100' };
    }
    // Si quedan menos de 100, alerta amarilla
    if (this.ticketsRestantes < 100) {
      return { text: 'Alta demanda 🔥', color: 'text-orange-600 bg-orange-50 border-orange-100' };
    }
    // Si hay muchas, no mostramos nada (null)
    return null;
  }



  incrementQuantity() {
    if (this.selectedTicketType && this.ticketQuantity < this.ticketsRestantes) {
      this.ticketQuantity++;
      this.updateFormAndTotal();
    }
  }

  decrementQuantity() {
    if (this.ticketQuantity > 1) {
      this.ticketQuantity--;
      this.updateFormAndTotal();
    }
  }

  updateFormAndTotal() {
    this.formCheckout.patchValue({ quantity: this.ticketQuantity });
    this.calculateTotal();
  }

  calculateTotal() {
    if (this.selectedTicketType) {
      this.baseAmount = this.ticketQuantity * this.selectedTicketType.price;
    } else if (this.evento && !this.ticketTypes.length) {
      // Legacy fallback
      this.baseAmount = this.ticketQuantity * (this.evento.price || 0);
    }

    // Total es solo el precio base (la comisión se maneja internamente via marketplace_fee)
    this.total = this.baseAmount;

    // Apply coupon discount
    if (this.appliedCoupon) {
      this.discountAmount = Math.round((this.total * this.appliedCoupon.discountPercent) / 100);
      this.finalTotal = this.total - this.discountAmount;
    } else {
      this.discountAmount = 0;
      this.finalTotal = this.total;
    }
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
    this.couponService.validateCoupon(this.couponCode.trim(), eventIdToUse).subscribe({
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
    if (!this.selectedTicketType && this.ticketTypes.length > 0) return;
    const guestBuyer = this.getGuestBuyer();
    if (!this.isAuthenticated && !guestBuyer) return;

    this.loading = true;
    this.paymentStatus = 'processing';

    if (this.eventId) {
      // 3. LOGICA MERCADO PAGO REAL (Marketplace)
      const ticketTypeId = this.selectedTicketType?.id || 0;

      this.ticketService.comprarTicket({ 
        cantidad: this.ticketQuantity, 
        ticketTypeId,
        promoterCode: this.promoterCode || undefined,
        couponId: this.appliedCoupon?.couponId,
        couponCode: this.appliedCoupon ? this.couponCode.trim() : undefined,
        buyer: guestBuyer || undefined
      }).subscribe({
        next: (response: any) => {
          if (response.init_point) {
            // Guardar información de comisión para mostrar en el checkout
            if (response.commission_info) {
              this.commissionPercent = response.commission_info.commission_percent;
              this.commissionAmount = response.commission_info.commission_amount;
              this.organizerPlanName = response.commission_info.plan_name;
            }
            
            try {
              const lastPurchase = {
                preferenceId: response.id,
                external_reference: response.external_reference,
                eventId: Number(this.eventId),
                ticketTypeId: ticketTypeId,
                quantity: this.ticketQuantity,
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
