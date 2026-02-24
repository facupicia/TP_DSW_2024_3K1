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
}

export interface QRPreferenceResponse {
    success: boolean;
    id: string;
    init_point: string;
    qr_code_url?: string;
    payment_type: 'qr';
    commission_info: {
        mp_commission_percent: number;
        mp_commission_amount: number;
        platform_net_amount: number;
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
     */
    connectMercadoPago(): Observable<MpConnectResponse> {
        return this.http.get<MpConnectResponse>(`${this.baseUrl}/mp/connect`);
    }

    /**
     * Desconecta la cuenta de Mercado Pago del usuario
     */
    disconnectMercadoPago(): Observable<{ success: boolean; message: string }> {
        return this.http.post<{ success: boolean; message: string }>(`${this.baseUrl}/mp/disconnect`, {});
    }

    /**
     * Crea una preferencia de pago para comprar tickets
     */
    createPreference(ticketTypeId: number, ticketQuantity: number, promoterCode?: string): Observable<PreferenceResponse> {
        return this.http.post<PreferenceResponse>(`${this.baseUrl}/create-preference`, {
            ticketTypeId,
            ticketQuantity,
            promoterCode
        });
    }

    /**
     * Crea una preferencia de pago por QR (Checkout Pro)
     * 
     * Ventajas:
     * - Comisión MP: 2.59% (vs 8%+ del marketplace)
     * - Pago instantáneo escaneando QR
     * - Ideal para venta rápida de tickets
     */
    createQRPreference(ticketTypeId: number, ticketQuantity: number): Observable<QRPreferenceResponse> {
        return this.http.post<QRPreferenceResponse>(`${this.baseUrl}/create-qr-preference`, {
            ticketTypeId,
            ticketQuantity
        });
    }
}
