import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { SubscriptionService } from '../../services/subscription.service';
import { ToastService } from '../../services/toast.service';

@Component({
    selector: 'app-subscription-callback',
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="callback-page">
            <div class="card">
                <div *ngIf="loading" class="loading">
                    <div class="spinner"></div>
                    <h2>Verificando tu suscripción...</h2>
                    <p>Por favor espera mientras confirmamos tu pago</p>
                </div>
                <div *ngIf="!loading && success" class="success">
                    <div class="icon">✅</div>
                    <h2>¡Suscripción Activada!</h2>
                    <p>Tu plan PRO está listo. Disfruta de eventos ilimitados.</p>
                    <button class="btn-primary" (click)="goToEvents()">Ir a Mis Eventos</button>
                </div>
                <div *ngIf="!loading && !success" class="error">
                    <div class="icon">❌</div>
                    <h2>Algo salió mal</h2>
                    <p>{{ errorMessage }}</p>
                    <button class="btn-secondary" (click)="retry()">Intentar de nuevo</button>
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
    `]
})
export class SubscriptionCallbackComponent implements OnInit {
    private router = inject(Router);
    private route = inject(ActivatedRoute);
    private subscriptionService = inject(SubscriptionService);
    private toast = inject(ToastService);

    loading = true;
    success = false;
    errorMessage = 'No pudimos confirmar tu suscripción. Por favor contacta a soporte.';

    ngOnInit() {
        // Check for manual verification via URL params
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
                    this.errorMessage = 'El pago fue procesado pero la suscripción no está activa. Contacta a soporte.';
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
                if (!this.success) {
                    this.errorMessage = 'Tu pago está siendo procesado. Puede tomar unos minutos.';
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

    retry() {
        this.router.navigate(['/subscription/upgrade']);
    }
}
