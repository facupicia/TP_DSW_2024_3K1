import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HeaderComponent } from '../../components/header/header.component';
import { UpgradeButtonComponent } from '../../components/upgrade-button/upgrade-button.component';
import { AuthService } from '../../services/auth.service';
import { SubscriptionService, UserSubscription } from '../../services/subscription.service';
import { PaymentService, MpStatus } from '../../services/payment.service';
import { ToastService } from '../../services/toast.service';

@Component({
    selector: 'app-settings',
    imports: [HeaderComponent, CommonModule, UpgradeButtonComponent],
    templateUrl: './settings.component.html',
    styleUrl: './settings.component.css'
})
export class SettingsComponent implements OnInit {
    private authService = inject(AuthService);
    private router = inject(Router);
    private subscriptionService = inject(SubscriptionService);
    private paymentService = inject(PaymentService);
    private toast = inject(ToastService);
    private destroyRef = inject(DestroyRef);

    userProfile: any = {};

    // Subscription
    subscription: UserSubscription | null = null;
    isPro = false;
    planExpiresAt: Date | null = null;
    cancellingSubscription = false;

    // Mercado Pago
    mpStatus: MpStatus | null = null;
    mpLoading = false;

    ngOnInit(): void {
        this.authService.ensureCurrentUser().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: (data) => {
                if (!data) {
                    this.router.navigate(['/login'], { queryParams: { returnUrl: '/settings' } });
                    return;
                }

                this.userProfile = data;
                this.loadSubscription();
                this.loadMpStatus();
            },
            error: () => this.router.navigate(['/login'], { queryParams: { returnUrl: '/settings' } })
        });
    }

    private loadSubscription(): void {
        this.subscriptionService.getMySubscription().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: (sub) => {
                this.subscription = sub;
                this.isPro = sub.plan?.name === 'PRO' && sub.status === 'active';
                if (sub.currentPeriodEnd) {
                    this.planExpiresAt = new Date(sub.currentPeriodEnd);
                }
            },
            error: (err) => console.error('Error loading subscription:', err)
        });
    }

    private loadMpStatus(): void {
        this.paymentService.getMpStatus().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: (status) => this.mpStatus = status,
            error: (err) => console.error('Error loading MP status:', err)
        });
    }

    // === SUBSCRIPTION ACTIONS ===

    cancelSubscription(): void {
        const confirmed = confirm(
            '¿Estás seguro de cancelar tu suscripción PRO?\n\n' +
            'Tu plan se mantendrá activo hasta el fin del período actual.'
        );
        if (!confirmed) return;

        this.cancellingSubscription = true;
        this.subscriptionService.cancelSubscription().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: (response) => {
                this.cancellingSubscription = false;
                this.toast.success(response.message || 'Suscripción cancelada');
                this.loadSubscription();
            },
            error: (err) => {
                this.cancellingSubscription = false;
                this.toast.error(err?.error?.message || 'Error al cancelar');
            }
        });
    }

    // === MERCADO PAGO ACTIONS ===

    connectMercadoPago(): void {
        this.mpLoading = true;
        this.paymentService.connectMercadoPago('/settings').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: (response) => {
                this.mpLoading = false;
                window.location.href = response.authUrl;
            },
            error: (err) => {
                this.mpLoading = false;
                this.toast.error(err?.error?.message || 'Error al conectar');
            }
        });
    }

    disconnectMercadoPago(): void {
        const confirmed = confirm('¿Desconectar tu cuenta de Mercado Pago?\n\nYa no podrás recibir pagos hasta reconectar.');
        if (!confirmed) return;

        this.mpLoading = true;
        this.paymentService.disconnectMercadoPago().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: (response) => {
                this.mpLoading = false;
                this.mpStatus = { connected: false, mpUserId: null, expiresAt: null, needsReconnect: false };
                this.toast.success(response.message || 'Mercado Pago desconectado');
            },
            error: (err) => {
                this.mpLoading = false;
                this.toast.error(err?.error?.message || 'Error al desconectar');
            }
        });
    }

    // === NAVIGATION ===

    editProfile(): void {
        if (this.userProfile.id) {
            this.router.navigate([`/profile/${this.userProfile.id}`]);
        }
    }

    goBack(): void {
        this.router.navigate(['/profile']);
    }

    logout(): void {
        this.authService.logout();
        this.router.navigate(['/']);
    }
}

