import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

export interface MpStatus {
    connected: boolean;
    mpUserId: string | null;
    expiresAt: string | null;
    needsReconnect: boolean;
}

export interface MpConnectResponse {
    authUrl: string;
    message: string;
}

export interface PreferenceResponse {
    id: string;
    init_point: string;
    marketplace?: boolean;
    guest_checkout?: boolean;
    delivery_email?: string;
    pricing: {
        base_amount: number;
        discount_amount?: number;
        total_amount: number;
        service_fee_percent?: number;
        service_fee_amount?: number;
        buyer_total_amount?: number;
        coupon_id?: number;
    };
    commission_info: {
        commission_percent: number;
        commission_amount: number;
        plan_name: string;
        organizer_net_amount: number;
    };
}


@Injectable({
    providedIn: 'root'
})
export class PaymentService {
    private http = inject(HttpClient);
    private baseUrl = environment.apiUrl + '/payment';

    /**
     * Obtiene el estado de conexión de Mercado Pago del usuario
     */
    getMpStatus(): Observable<MpStatus> {
        return this.http.get<MpStatus>(`${this.baseUrl}/mp/status`);
    }

    /**
     * Inicia el flujo OAuth para conectar Mercado Pago
     * Retorna la URL a la que se debe redirigir al usuario
     * @param redirectTo Ruta a la que redirigir después del OAuth (ej: /create-event)
     */
    connectMercadoPago(redirectTo?: string): Observable<MpConnectResponse> {
        const params = redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : '';
        return this.http.get<MpConnectResponse>(`${this.baseUrl}/mp/connect${params}`);
    }

    /**
     * Desconecta la cuenta de Mercado Pago del usuario
     */
    disconnectMercadoPago(): Observable<{ success: boolean; message: string }> {
        return this.http.post<{ success: boolean; message: string }>(`${this.baseUrl}/mp/disconnect`, {});
    }

    /**
     * Crea una preferencia de pago para comprar tickets
     * @param items Array de items del carrito con ticketTypeId y quantity
     * @param extraItems Array de extras opcionales con eventProductId y quantity
     * @param promoterCode Código del promotor opcional
     * @param couponId ID del cupón opcional
     * @param couponCode Código del cupón opcional
     * @param buyer Datos del comprador para guest checkout
     */
    createPreference(
        items: Array<{ ticketTypeId: number; quantity: number }>,
        extraItems?: Array<{ eventProductId: number; quantity: number }>,
        promoterCode?: string,
        couponId?: number,
        couponCode?: string,
        buyer?: {
            firstname: string;
            lastname: string;
            email: string;
            phone: string;
            birth?: string;
        }
    ): Observable<PreferenceResponse> {
        return this.http.post<PreferenceResponse>(`${this.baseUrl}/create-preference`, {
            items,
            extraItems,
            promoterCode,
            couponId,
            couponCode,
            buyer
        });
    }

}
