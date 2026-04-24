import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { TicketService } from '../../services/ticket.service';
import { ToastService } from '../../services/toast.service';
import { environment } from '../../../environments/environment';

@Component({
    selector: 'app-checkout-success',
    standalone: true,
    imports: [CommonModule, RouterModule],
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
    pollRef: any;
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
                this.profileService.currentUser$.subscribe(user => {
                    this.userProfile = user || {};
                });
                if (!this.userProfile?.id && window.localStorage?.getItem('token')) {
                    this.profileService.getProfile().subscribe();
                }
            }

            this.startPolling();
        }
    }
    ngOnDestroy(): void {
        if (this.pollRef) clearInterval(this.pollRef);
    }
    startPolling() {
        this.loading = true;
        this.confirmed = false;
        this.attempts = 0;
        const extRef = this.externalReference;
        
        this.pollRef = setInterval(() => {
            this.attempts++;
            
            if (extRef) {
                this.http.get<{ success: boolean; status: string; paymentLogId?: number }>(
                    `${environment.apiUrl}/payment/status?external_reference=${encodeURIComponent(extRef)}`
                ).subscribe({
                    next: (state) => {
                        if (state?.status === 'failure') {
                            this.loading = false;
                            this.confirmed = false;
                            this.toast.error('Tu pago fue rechazado. Intenta nuevamente.');
                            clearInterval(this.pollRef);
                            return;
                        }

                        if (state?.status === 'approved' && this.guestCheckout) {
                            this.loading = false;
                            this.confirmed = true;
                            this.toast.success(this.deliveryEmail
                                ? `Pago confirmado. Enviamos las entradas a ${this.deliveryEmail}.`
                                : 'Pago confirmado. Tus entradas ya fueron enviadas.');
                            clearInterval(this.pollRef);
                        }
                    },
                    error: () => {
                        // Ignorar errores de este endpoint, seguir con el polling normal
                    }
                });
            }

            if (this.guestCheckout) {
                if (this.attempts >= this.maxAttempts) {
                    clearInterval(this.pollRef);
                    this.loading = false;
                    this.confirmed = false;
                    this.toast.info(this.deliveryEmail
                        ? `Seguimos procesando la compra. Te avisaremos por correo en ${this.deliveryEmail}.`
                        : 'Seguimos procesando la compra. Te avisaremos por correo.');
                }
                return;
            }

            this.tickets.getLastPurchase().subscribe({
                next: (resp) => {
                    if (resp.status === 'approved' && resp.tickets?.length) {
                        this.lastTickets = resp.tickets;
                        this.loading = false;
                        this.confirmed = true;
                        this.toast.success('¡Pago confirmado! Aquí están tus tickets');
                        clearInterval(this.pollRef);
                    } else if (resp.status === 'processing') {
                        // sigue intentando
                    } else if (resp.status === 'no_logs') {
                        // aún no hay webhook, seguir intentando
                    }
                },
                error: (_err) => {
                    // fallo de red, reintentar hasta límite
                    if (_err?.status === 401) {
                        this.toast.warning('Tu sesión expiró. Inicia sesión nuevamente para ver los tickets.');
                        clearInterval(this.pollRef);
                    }
                }
            });
            
            // Límite de intentos alcanzado
            if (this.attempts >= this.maxAttempts) {
                clearInterval(this.pollRef);
                this.loading = false;
                this.confirmed = false;
                this.toast.info('Aún estamos procesando tu compra. Te avisaremos por correo.');
            }
        }, 2000);
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
