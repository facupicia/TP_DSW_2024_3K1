import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Coupon {
    id?: number;
    code: string;
    discountPercent: number;
    maxUses: number;
    usedCount?: number;
    expiresAt?: string | null;
    isActive: boolean;
    eventId: number;
    createdAt?: string;
}

export interface CouponValidationResult {
    valid: boolean;
    discountPercent?: number;
    couponId?: number;
    message: string;
}

@Injectable({
    providedIn: 'root'
})
export class CouponService {
    private http = inject(HttpClient);
    private baseUrl = `${environment.apiUrl}/coupon`;

    /**
     * Create a new coupon for an event
     */
    createCoupon(coupon: Partial<Coupon>): Observable<Coupon> {
        return this.http.post<Coupon>(this.baseUrl, coupon);
    }

    /**
     * Get all coupons for an event
     */
    getCouponsByEvent(eventId: number): Observable<Coupon[]> {
        return this.http.get<Coupon[]>(`${this.baseUrl}/event/${eventId}`);
    }

    /**
     * Delete a coupon
     */
    deleteCoupon(couponId: number): Observable<{ message: string }> {
        return this.http.delete<{ message: string }>(`${this.baseUrl}/${couponId}`);
    }

    /**
     * Toggle coupon active status
     */
    toggleCoupon(couponId: number): Observable<Coupon> {
        return this.http.put<Coupon>(`${this.baseUrl}/${couponId}/toggle`, {});
    }

    /**
     * Validate a coupon code (for checkout)
     */
    validateCoupon(code: string, eventId: number): Observable<CouponValidationResult> {
        return this.http.post<CouponValidationResult>(`${this.baseUrl}/validate`, { code, eventId });
    }
}
