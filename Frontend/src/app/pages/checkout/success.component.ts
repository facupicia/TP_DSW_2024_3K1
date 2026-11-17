import { Component, OnDestroy, OnInit, inject } from '@angular/core';

import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { TicketService } from '../../services/ticket.service';
import { ToastService } from '../../services/toast.service';
import { environment } from '../../../environments/environment';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-checkout-success',
    imports: [RouterModule],
    templateUrl: './success.component.html'
})
export class CheckoutSuccessComponent implements OnInit, OnDestroy {
    private http = inject(HttpClient);
    private route = inject(ActivatedRoute);
    private statusToken = '';
    private requests = new Subscription();
    
    constructor(
        private profileService: AuthService,
        private router: Router,
        private tickets: TicketService,
        private toast: ToastService,
    ) { }
    userProfile: any = {};
    loading = true;
    confirmed = false;
    attempts = 0;
    maxAttempts = 10;
    lastTickets: any[] = [];
    pollRef: ReturnType<typeof setTimeout> | null = null;
    private profileSub?: Subscription;
    private pollingStopped = false;
    guestCheckout = false;
    deliveryEmail = '';
    externalReference: string | null = null;
    statusMessage='La confirmación sigue pendiente. Revisá tus entradas o el correo antes de volver a comprar.';
    ngOnInit(): void {
        if (typeof window !== 'undefined') {
            try {
                const rawLastPurchase = window.sessionStorage?.getItem('lastPurchase');
                if (rawLastPurchase) {
                    const parsed = JSON.parse(rawLastPurchase);
                    this.guestCheckout = !!parsed?.guestCheckout;
                    this.deliveryEmail = parsed?.deliveryEmail || '';
                    this.externalReference = parsed?.external_reference || null;
                    this.statusToken = parsed?.statusToken || '';
                    const returnedRef = this.route.snapshot.queryParamMap.get('external_reference');
                    if (returnedRef && returnedRef !== this.externalReference) { this.externalReference = returnedRef; this.statusToken = ''; this.guestCheckout = false; }
                }
            } catch { }

            if (!this.guestCheckout) {
                this.profileSub = this.profileService.currentUser$.subscribe(user => {
                    this.userProfile = user || {};
                });
                this.profileService.ensureCurrentUser().subscribe(user => {
                    this.userProfile = user || {};
                });
            }

            this.externalReference ||= this.route.snapshot.queryParamMap.get('external_reference');
            this.startPolling();
        }
    }
    ngOnDestroy(): void {
        if (this.pollRef) clearTimeout(this.pollRef);
        this.profileSub?.unsubscribe();
        this.requests.unsubscribe();
        this.pollingStopped = true;
    }

    startPolling() {
        if (!this.externalReference) {
            this.loading = false;
            this.statusMessage='No pudimos identificar esta compra. Revisá tus entradas o el correo de confirmación.';
            this.toast.warning('No pudimos identificar esta compra. Revisá tus entradas o el correo de confirmación.');
            return;
        }
        this.loading = true;
        this.confirmed = false;
        this.attempts = 0;
        this.pollingStopped = false;
        this.scheduleNextPoll(0);
    }

    private scheduleNextPoll(delayMs = 2000): void {
        if (this.pollingStopped) return;
        this.pollRef = setTimeout(() => this.pollOnce(), delayMs);
    }

    private pollOnce(): void {
        if (this.pollingStopped) return;

        this.attempts++;

        if (this.guestCheckout) {
            this.pollGuestPurchase();
            return;
        }

        this.requests.add(this.tickets.getLastPurchase(this.externalReference || undefined).subscribe({
            next: (resp) => {
                if (resp.status === 'approved' && resp.tickets?.length) {
                    this.lastTickets = resp.tickets;
                    this.stopPolling(true);
                    this.toast.success('¡Pago confirmado! Aquí están tus tickets');
                    return;
                }

                if (resp.status === 'failed' || resp.status === 'failure') {
                    this.statusMessage='La compra no se pudo completar. Revisá el estado del pago y cualquier devolución con soporte.';
                    this.stopPolling(false);
                    this.toast.error('No pudimos completar la compra. Revisá el estado del pago antes de volver a intentar.');
                    return;
                }

                this.continueOrTimeout();
            },
            error: (_err) => {
                if (_err?.status === 401) {
                    this.stopPolling(false);
                    this.toast.warning('Tu sesión expiró. Inicia sesión nuevamente para ver los tickets.');
                    return;
                }

                this.continueOrTimeout();
            }
        }));
    }

    private pollGuestPurchase(): void {
        const extRef = this.externalReference;

        if (!extRef) {
            this.continueOrTimeout();
            return;
        }

        this.requests.add(this.http.get<{ success: boolean; status: string }>(
            `${environment.apiUrl}/payment/status?external_reference=${encodeURIComponent(extRef)}`,
            { headers: { 'X-Checkout-Token': this.statusToken } }
        ).subscribe({
            next: (state) => {
                if (state?.status === 'failure' || state?.status === 'failed') {
                    this.statusMessage='La compra no se pudo completar. Revisá el estado del pago y cualquier devolución con soporte.';
                    this.stopPolling(false);
                    this.toast.error('No pudimos completar la compra. Revisá el estado del pago antes de volver a intentar.');
                    return;
                }

                if (state?.status === 'approved') {
                    this.stopPolling(true);
                    this.toast.success(this.deliveryEmail
                        ? `Pago confirmado. Recibirás las entradas en ${this.deliveryEmail}.`
                        : 'Pago confirmado. Recibirás tus entradas por correo.');
                    return;
                }

                this.continueOrTimeout();
            },
            error: () => this.continueOrTimeout()
        }));
    }

    private continueOrTimeout(): void {
        if (this.attempts >= this.maxAttempts) {
            this.stopPolling(false);
            this.toast.info(this.deliveryEmail
                ? `Seguimos procesando la compra. Te avisaremos por correo en ${this.deliveryEmail}.`
                : 'Aún estamos procesando tu compra. Te avisaremos por correo.');
            return;
        }

        this.scheduleNextPoll();
    }

    private stopPolling(confirmed: boolean): void {
        this.pollingStopped = true;
        if (this.pollRef) clearTimeout(this.pollRef);
        this.loading = false;
        this.confirmed = confirmed;
        if (confirmed && typeof window !== 'undefined') {
            window.sessionStorage.removeItem('lastPurchase');
        }
    }

    verTickets() {
        if (this.guestCheckout) {
            this.router.navigate(['/events']);
            return;
        }

        this.router.navigate(['/my-tickets']);
    }
}
