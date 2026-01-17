import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { SubscriptionService } from '../../services/subscription.service';
import { ToastService } from '../../services/toast.service';
import { AuthService } from '../../services/auth.service';

@Component({
    selector: 'app-subscription-callback',
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="callback-page">
            <div class="card">
                <!-- Loading state -->
                <div *ngIf="loading" class="loading">
                    <div class="spinner"></div>
                    <h2>Verificando tu suscripción...</h2>
                    <p>Por favor espera mientras confirmamos tu pago</p>
                </div>

                <!-- Not logged in - show generic success -->
                <div *ngIf="!loading && !isLoggedIn" class="not-logged-in">
                    <div class="icon">✅</div>
                    <h2>¡Pago Procesado!</h2>
                    <p>Tu suscripción se está activando. Inicia sesión para verificar tu plan PRO.</p>
                    <button class="btn-primary" (click)="goToLogin()">Iniciar Sesión</button>
                </div>

                <!-- Logged in and success -->
                <div *ngIf="!loading && isLoggedIn && success" class="success">
                    <div class="icon">✅</div>
                    <h2>¡Suscripción Activada!</h2>
                    <p>Tu plan PRO está listo. Disfruta de eventos ilimitados.</p>
                    <button class="btn-primary" (click)="goToEvents()">Ir a Mis Eventos</button>
                </div>

                <!-- Logged in but verification failed/pending -->
                <div *ngIf="!loading && isLoggedIn && !success" class="pending">
                    <div class="icon">⏳</div>
                    <h2>Procesando Pago</h2>
                    <p>{{ errorMessage }}</p>
                    <div class="button-group">
                        <button class="btn-secondary" (click)="retry()">Reintentar Verificación</button>
                        <button class="btn-primary" (click)="goToProfile()">Ir a Mi Perfil</button>
                    </div>
                </div>
            </div>
        </div>
    `,
    styles: [`
        .callback-page {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(180deg, #f8f9fa 0%, #e9ecef 100%);
            padding: 20px;
        }

        .card {
            background: white;
            border-radius: 16px;
            padding: 48px;
            max-width: 400px;
            width: 100%;
            text-align: center;
            box-shadow: 0 4px 24px rgba(0,0,0,0.1);
        }

        .loading .spinner {
            width: 48px;
            height: 48px;
            border: 4px solid #e9ecef;
            border-top-color: #7c3aed;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 24px;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        h2 {
            font-size: 24px;
            font-weight: 700;
            color: #212529;
            margin: 0 0 8px;
        }

        p {
            color: #6c757d;
            margin: 0 0 24px;
        }

        .icon {
            font-size: 64px;
            margin-bottom: 24px;
        }

        .button-group {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .btn-primary, .btn-secondary {
            padding: 14px 32px;
            border-radius: 10px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            border: none;
            transition: all 0.2s ease;
        }

        .btn-primary {
            background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
            color: white;
        }

        .btn-secondary {
            background: #e9ecef;
            color: #495057;
        }

        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);
        }
    `]
})
export class SubscriptionCallbackComponent implements OnInit {
    private router = inject(Router);
    private route = inject(ActivatedRoute);
    private subscriptionService = inject(SubscriptionService);
    private authService = inject(AuthService);
    private toast = inject(ToastService);

    loading = true;
    success = false;
    isLoggedIn = false;
    errorMessage = 'Tu pago está siendo procesado. Puede tomar unos minutos en activarse.';

    ngOnInit() {
        // Check if user is logged in
        this.isLoggedIn = typeof window !== 'undefined' && !!localStorage.getItem('token');

        if (!this.isLoggedIn) {
            // Not logged in - just show success message
            // The webhook has already activated the subscription
            this.loading = false;
            return;
        }

        // User is logged in - try to verify the subscription
        this.route.queryParams.subscribe(params => {
            const preapprovalId = params['preapproval_id'];
            if (preapprovalId) {
                this.verifyWithId(preapprovalId);
            } else {
                // Give MP webhook time to process if no ID (fallback)
                setTimeout(() => {
                    this.checkSubscription();
                }, 2000);
            }
        });
    }

    verifyWithId(id: string) {
        this.subscriptionService.verifySubscription(id).subscribe({
            next: (response) => {
                this.loading = false;
                if (response.active) {
                    this.success = true;
                    this.toast.success('¡Plan PRO activado!');
                } else {
                    this.errorMessage = 'El pago fue procesado pero la suscripción aún no está activa. Espera unos segundos y refresca.';
                }
            },
            error: (err) => {
                console.error('Verification error:', err);
                // Fallback to normal check if manual verification fails
                this.checkSubscription();
            }
        });
    }

    checkSubscription() {
        this.subscriptionService.getMySubscription().subscribe({
            next: (sub) => {
                this.loading = false;
                if (sub.plan.name === 'PRO' && sub.status === 'active') {
                    this.success = true;
                    this.toast.success('¡Plan PRO activado!');
                } else {
                    // Might still be processing, check again
                    setTimeout(() => {
                        this.verifyAgain();
                    }, 3000);
                }
            },
            error: () => {
                this.loading = false;
                this.success = false;
            }
        });
    }

    verifyAgain() {
        this.subscriptionService.getMySubscription().subscribe({
            next: (sub) => {
                this.loading = false;
                this.success = sub.plan.name === 'PRO' && sub.status === 'active';
                if (this.success) {
                    this.toast.success('¡Plan PRO activado!');
                }
            },
            error: () => {
                this.loading = false;
                this.success = false;
            }
        });
    }

    goToEvents() {
        this.router.navigate(['/my-events']);
    }

    goToProfile() {
        this.router.navigate(['/profile']);
    }

    goToLogin() {
        this.router.navigate(['/login']);
    }

    retry() {
        this.loading = true;
        this.checkSubscription();
    }
}
