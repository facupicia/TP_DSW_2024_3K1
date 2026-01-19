import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// Interfaces matching backend response types
export interface SubscriptionMetrics {
    activeSubscriptions: {
        total: number;
        byPlan: Array<{ planName: string; count: number; displayName: string }>;
    };
    newSubscriptions: number;
    cancelledSubscriptions: number;
    churnRate: number;
    mrr: number;
    proUsers: number;
    freeUsers: number;
}

export interface MarketplaceMetrics {
    ticketsSold: number;
    grossRevenue: number;
    averageTicketPrice: number;
    totalTransactions: number;
    successfulPayments: number;
    failedPayments: number;
}

export interface CommissionMetrics {
    totalCommission: number;
    commissionByPeriod: number;
    averageCommissionPercent: number;
    topOrganizers: Array<{
        organizerId: number;
        organizerName: string;
        totalCommission: number;
        totalGmv: number;
        salesCount: number;
    }>;
}

export interface UserMetrics {
    totalUsers: number;
    newUsers: number;
    usersWithActiveSubscription: number;
    activeOrganizers: number;
}

export interface EventMetrics {
    totalEvents: number;
    activeEvents: number;
    inactiveEvents: number;
    featuredEvents: number;
    upcomingEvents: number;
    pastEvents: number;
    averageCapacityUtilization: number;
}

export interface RevenueOverview {
    totalRevenue: number;
    commissionRevenue: number;
    subscriptionRevenue: number;
    gmv: number;
}

export interface TrendDataPoint {
    period: string;
    commission: number;
    subscriptions: number;
    gmv: number;
    transactions: number;
}

export interface EventRanking {
    eventId: number;
    eventTitle: string;
    organizer: string;
    ticketsSold: number;
    totalRevenue: number;
    platformCommission: number;
}

export interface OverviewResponse {
    revenue: RevenueOverview;
    subscriptions: SubscriptionMetrics;
    marketplace: MarketplaceMetrics;
    commissions: CommissionMetrics;
    users: UserMetrics;
    events: EventMetrics;
    period: { startDate: Date | null; endDate: Date | null };
}

export interface DateRange {
    startDate: Date;
    endDate: Date;
}

@Injectable({
    providedIn: 'root'
})
export class AdminService {
    private http = inject(HttpClient);
    private apiUrl = `${environment.apiUrl}/admin/metrics`;

    /**
     * Build query params with date range
     */
    private buildParams(dateRange?: DateRange): HttpParams {
        let params = new HttpParams();
        if (dateRange) {
            params = params.set('startDate', dateRange.startDate.toISOString());
            params = params.set('endDate', dateRange.endDate.toISOString());
        }
        return params;
    }

    /**
     * Get comprehensive dashboard overview
     */
    getOverview(dateRange?: DateRange): Observable<{ success: boolean; data: OverviewResponse }> {
        const params = this.buildParams(dateRange);
        return this.http.get<{ success: boolean; data: OverviewResponse }>(`${this.apiUrl}/overview`, { params });
    }

    /**
     * Get subscription analytics
     */
    getSubscriptionMetrics(dateRange?: DateRange): Observable<{ success: boolean; data: SubscriptionMetrics }> {
        const params = this.buildParams(dateRange);
        return this.http.get<{ success: boolean; data: SubscriptionMetrics }>(`${this.apiUrl}/subscriptions`, { params });
    }

    /**
     * Get marketplace sales data
     */
    getMarketplaceMetrics(dateRange?: DateRange): Observable<{ success: boolean; data: MarketplaceMetrics }> {
        const params = this.buildParams(dateRange);
        return this.http.get<{ success: boolean; data: MarketplaceMetrics }>(`${this.apiUrl}/marketplace`, { params });
    }

    /**
     * Get commission breakdown
     */
    getCommissionMetrics(dateRange?: DateRange, limit: number = 10): Observable<{ success: boolean; data: CommissionMetrics }> {
        let params = this.buildParams(dateRange);
        params = params.set('limit', limit.toString());
        return this.http.get<{ success: boolean; data: CommissionMetrics }>(`${this.apiUrl}/commissions`, { params });
    }

    /**
     * Get user growth metrics
     */
    getUserMetrics(dateRange?: DateRange): Observable<{ success: boolean; data: UserMetrics }> {
        const params = this.buildParams(dateRange);
        return this.http.get<{ success: boolean; data: UserMetrics }>(`${this.apiUrl}/users`, { params });
    }

    /**
     * Get event metrics
     */
    getEventMetrics(): Observable<{ success: boolean; data: EventMetrics }> {
        return this.http.get<{ success: boolean; data: EventMetrics }>(`${this.apiUrl}/events`);
    }

    /**
     * Get revenue trend data for charts
     */
    getRevenueTrend(period: 'day' | 'week' | 'month', last: number): Observable<{ success: boolean; data: TrendDataPoint[] }> {
        const params = new HttpParams()
            .set('period', period)
            .set('last', last.toString());
        return this.http.get<{ success: boolean; data: TrendDataPoint[] }>(`${this.apiUrl}/revenue-trend`, { params });
    }

    /**
     * Get top events by revenue
     */
    getTopEvents(limit: number = 10, dateRange?: DateRange): Observable<{ success: boolean; data: EventRanking[] }> {
        let params = this.buildParams(dateRange);
        params = params.set('limit', limit.toString());
        return this.http.get<{ success: boolean; data: EventRanking[] }>(`${this.apiUrl}/top-events`, { params });
    }

    /**
     * Get top organizers by commission
     */
    getTopOrganizers(limit: number = 10, dateRange?: DateRange): Observable<{ success: boolean; data: CommissionMetrics['topOrganizers'] }> {
        let params = this.buildParams(dateRange);
        params = params.set('limit', limit.toString());
        return this.http.get<{ success: boolean; data: CommissionMetrics['topOrganizers'] }>(`${this.apiUrl}/top-organizers`, { params });
    }
}
