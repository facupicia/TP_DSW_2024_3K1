import { Component, OnDestroy, OnInit, inject } from '@angular/core';

import { Router, RouterModule } from '@angular/router';
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
    ngOnInit(): void {
        if (typeof window !== 'undefined') {
            try {
                const rawLastPurchase = window.localStorage?.getItem('lastPurchase');
                if (rawLastPurchase) {
                    const parsed = JSON.parse(rawLastPurchase);
                    this.guestCheckout = !!parsed?.guestCheckout;
                    this.deliveryEmail = parsed?.deliveryEmail || '';
                    this.externalReference = parsed?.external_reference || null;
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

            this.startPolling();
        }
    }
    ngOnDestroy(): void {
        if (this.pollRef) clearTimeout(this.pollRef);
        this.profileSub?.unsubscribe();
        this.pollingStopped = true;
    }

    startPolling() {
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

        this.tickets.getLastPurchase().subscribe({
            next: (resp) => {
                if (resp.status === 'approved' && resp.tickets?.length) {
                    this.lastTickets = resp.tickets;
                    this.stopPolling(true);
                    this.toast.success('¡Pago confirmado! Aquí están tus tickets');
                    return;
                }

                if (resp.status === 'failed' || resp.status === 'failure') {
                    this.stopPolling(false);
                    this.toast.error('Tu pago fue rechazado. Intenta nuevamente.');
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
        });
    }

    private pollGuestPurchase(): void {
        const extRef = this.externalReference;

        if (!extRef) {
            this.continueOrTimeout();
            return;
        }

        this.http.get<{ success: boolean; status: string }>(
            `${environment.apiUrl}/payment/status?external_reference=${encodeURIComponent(extRef)}`
        ).subscribe({
            next: (state) => {
                if (state?.status === 'failure' || state?.status === 'failed') {
                    this.stopPolling(false);
                    this.toast.error('Tu pago fue rechazado. Intenta nuevamente.');
                    return;
                }

                if (state?.status === 'approved') {
                    this.stopPolling(true);
                    this.toast.success(this.deliveryEmail
                        ? `Pago confirmado. Enviamos las entradas a ${this.deliveryEmail}.`
                        : 'Pago confirmado. Tus entradas ya fueron enviadas.');
                    return;
                }

                this.continueOrTimeout();
            },
            error: () => this.continueOrTimeout()
        });
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
    }

    verTickets() {
        if (this.guestCheckout) {
            this.router.navigate(['/events']);
            return;
        }

        if (this.userProfile.id) {
            this.router.navigate([`/my-tickets/${this.userProfile.id}`]);
        } else {
            this.router.navigate(['/events']);
        }
    }
}
