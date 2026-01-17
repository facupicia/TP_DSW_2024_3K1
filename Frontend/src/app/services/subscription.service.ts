import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { tap, shareReplay, catchError } from 'rxjs/operators';

export interface SubscriptionPlan {
    id: number;
    name: string;
    displayName: string;
    monthlyPrice: number;
    yearlyPrice: number | null;
    maxEventsPerMonth: number;
    maxTicketTypesPerEvent: number;
    commissionPercent: number;
    features: {
        advancedDashboard?: boolean;
        exportSales?: boolean;
        featuredEvents?: boolean;
        prioritySupport?: boolean;
        removeBranding?: boolean;
        customBranding?: boolean;
    };
}

export interface UserSubscription {
    id: number;
    plan: {
        id: number;
        name: string;
        displayName: string;
        commissionPercent: number;
        monthlyPrice: number;
        yearlyPrice: number | null;
        features: any;
    };
    status: 'active' | 'expired' | 'cancelled' | 'pending';
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    externalSubscriptionId: string | null;
}

export interface SubscriptionLimits {
    plan: {
        id: number;
        name: string;
        displayName: string;
        commissionPercent: number;
        features: any;
    };
    limits: {
        maxEventsPerMonth: number;
        maxTicketTypesPerEvent: number;
        eventsCreatedThisMonth: number;
        eventsRemaining: number;
    };
    status: string;
    expiresAt: string | null;
}

export interface CheckoutResponse {
    checkoutUrl: string;
    preapprovalId: string;
    message: string;
}

@Injectable({
    providedIn: 'root'
})
export class SubscriptionService {
    private http = inject(HttpClient);
    private baseUrl = environment.apiUrl + '/subscription';

    // === CACHED OBSERVABLES ===
    private limitsSubject = new BehaviorSubject<SubscriptionLimits | null>(null);
    public limits$ = this.limitsSubject.asObservable();

    private subscriptionSubject = new BehaviorSubject<UserSubscription | null>(null);
    public subscription$ = this.subscriptionSubject.asObservable();

    private plansCache$: Observable<SubscriptionPlan[]> | null = null;
    private subscriptionCache$: Observable<UserSubscription> | null = null;
    private cacheTimestamp = 0;
    private readonly CACHE_DURATION = 60000; // 1 minuto de caché

    // === PLANS (cached, rarely changes) ===
    getPlans(): Observable<SubscriptionPlan[]> {
        if (!this.plansCache$) {
            this.plansCache$ = this.http.get<SubscriptionPlan[]>(`${this.baseUrl}/plans`).pipe(
                shareReplay(1)
            );
        }
        return this.plansCache$;
    }

    // === SUBSCRIPTION (cached with TTL) ===
    getMySubscription(forceRefresh = false): Observable<UserSubscription> {
        const now = Date.now();
        const cacheExpired = (now - this.cacheTimestamp) > this.CACHE_DURATION;

        if (!forceRefresh && !cacheExpired && this.subscriptionCache$) {
            return this.subscriptionCache$;
        }

        this.cacheTimestamp = now;
        this.subscriptionCache$ = this.http.get<UserSubscription>(`${this.baseUrl}/my-subscription`).pipe(
            tap(sub => this.subscriptionSubject.next(sub)),
            shareReplay(1),
            catchError(err => {
                this.subscriptionCache$ = null; // Clear cache on error
                throw err;
            })
        );
        return this.subscriptionCache$;
    }

    // Force refresh the subscription cache
    refreshSubscription(): Observable<UserSubscription> {
        return this.getMySubscription(true);
    }

    // Quick check if user is PRO (from cached data)
    isPro(): boolean {
        const sub = this.subscriptionSubject.getValue();
        return sub?.plan?.name === 'PRO' && sub?.status === 'active';
    }

    // === LIMITS ===
    getMyLimits(): Observable<SubscriptionLimits> {
        return this.http.get<SubscriptionLimits>(`${this.baseUrl}/my-limits`).pipe(
            tap(limits => this.limitsSubject.next(limits))
        );
    }

    createCheckout(planId: number, billingType: 'monthly' | 'yearly' = 'monthly'): Observable<CheckoutResponse> {
        return this.http.post<CheckoutResponse>(`${this.baseUrl}/checkout/${planId}`, { billingType });
    }

    cancelSubscription(): Observable<{ message: string; success: boolean }> {
        return this.http.post<{ message: string; success: boolean }>(`${this.baseUrl}/cancel`, {});
    }

    verifySubscription(preapprovalId: string): Observable<any> {
        return this.http.post(`${this.baseUrl}/verify/${preapprovalId}`, {});
    }

    refreshLimits(): void {
        this.getMyLimits().subscribe();
    }

    hasFeature(limits: SubscriptionLimits | null, feature: keyof SubscriptionPlan['features']): boolean {
        return limits?.plan?.features?.[feature] === true;
    }

    canCreateEvent(limits: SubscriptionLimits | null): boolean {
        if (!limits) return false;
        if (limits.limits.maxEventsPerMonth === -1) return true;
        return limits.limits.eventsRemaining > 0;
    }

    canCreateTicketTypes(limits: SubscriptionLimits | null, count: number): boolean {
        if (!limits) return false;
        if (limits.limits.maxTicketTypesPerEvent === -1) return true;
        return count <= limits.limits.maxTicketTypesPerEvent;
    }

    isFreePlan(limits: SubscriptionLimits | null): boolean {
        return limits?.plan?.name === 'FREE';
    }

    getPlanDisplayInfo(planName: string): { colorClass: string; icon: string; badge: string } {
        switch (planName?.toUpperCase()) {
            case 'PRO':
                return {
                    colorClass: 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white',
                    icon: '⭐',
                    badge: 'PRO'
                };
            case 'FREE':
            default:
                return {
                    colorClass: 'bg-gray-100 text-gray-700 border border-gray-200',
                    icon: '📋',
                    badge: 'FREE'
                };
        }
    }

    formatPrice(price: number): string {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 0
        }).format(price);
    }
}
