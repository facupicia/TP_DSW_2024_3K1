import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
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
    ngOnInit(): void {
        this.profileService.currentUser$.subscribe(user => {
            this.userProfile = user || {};
        });
        if (typeof window !== 'undefined' && !this.userProfile?.id && window.localStorage?.getItem('token')) {
            this.profileService.getProfile().subscribe();
        }
        if (typeof window !== 'undefined') {
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
        // Intento de verificación por external_reference
        let extRef: string | null = null;
        try {
            const lp = window.localStorage?.getItem('lastPurchase');
            if (lp) {
                const parsed = JSON.parse(lp);
                extRef = parsed?.external_reference || null;
            }
        } catch {}
        this.pollRef = setInterval(() => {
            this.attempts++;
            // Si hay external_reference, consultar estado de pago
            if (extRef) {
                fetch(`${environment.apiUrl}/payment/status?external_reference=${encodeURIComponent(extRef)}`, {
                    headers: {}
                }).then(r => r.json()).then(state => {
                    if (state?.status === 'failure') {
                        this.loading = false;
                        this.confirmed = false;
                        this.toast.error('Tu pago fue rechazado. Intenta nuevamente.');
                        clearInterval(this.pollRef);
                    }
                }).catch(() => {});
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
                        // aún no hay webhook
                    }
                },
                error: (_err) => {
                    // fallo de red, reintentar hasta límite
                    if (_err?.status === 401) {
                        this.toast.warning('Tu sesión expiró. Inicia sesión nuevamente para ver los tickets.');
                    }
                }
            });
            if (this.attempts >= this.maxAttempts) {
                clearInterval(this.pollRef);
                this.loading = false;
                this.confirmed = false;
                this.toast.info('Aún estamos procesando tu compra. Te avisaremos por correo.');
            }
        }, 2000);
    }
    verTickets() {
        // Si tienes el ID en userProfile, úsalo. Si no, ajusta la ruta.
        if (this.userProfile.id) {
            this.router.navigate([`/my-tickets/${this.userProfile.id}`]);
        } else {
            this.router.navigate(['/events']);
        }
    }
}
