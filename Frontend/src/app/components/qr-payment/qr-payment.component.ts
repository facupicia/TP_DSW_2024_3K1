import { Component, Input, Output, EventEmitter, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PaymentService, QRPreferenceResponse } from '../../services/payment.service';
import { ToastService } from '../../services/toast.service';

// Para generar QR como data URL usando Google Charts API
function generateQRDataUrl(text: string, size: number = 200): string {
  const encodedText = encodeURIComponent(text);
  return `https://chart.googleapis.com/chart?cht=qr&chs=${size}x${size}&chl=${encodedText}&chld=H|0`;
}

@Component({
  selector: 'app-qr-payment',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="qr-payment-container bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
      
      <div class="text-center mb-6">
        <div class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg class="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
          </svg>
        </div>
        <h3 class="text-xl font-bold text-gray-900">Pagar con QR</h3>
        <p class="text-sm text-gray-500 mt-1">El organizador recibe el 100% del precio de la entrada</p>
      </div>

      <div *ngIf="loading" class="text-center py-8">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p class="text-gray-500 mt-4">Generando codigo QR...</p>
      </div>

      <div *ngIf="qrData && !loading" class="text-center">
        
        <!-- Desglose de precios -->
        <div class="bg-gray-50 rounded-lg p-4 mb-4 text-left">
          <p class="text-xs font-bold text-gray-400 uppercase mb-2">Desglose del pago</p>
          
          <div class="flex justify-between text-sm mb-1">
            <span class="text-gray-600">Entrada{{ quantity > 1 ? 's' : '' }} ({{ quantity }}x)</span>
            <span class="font-medium">{{ qrData.pricing.base_amount | currency:'ARS':'symbol':'1.2-2' }}</span>
          </div>
          
          <div class="flex justify-between text-sm mb-1">
            <span class="text-gray-600">Cargo de servicio ({{ qrData.pricing.service_fee_percent }}%)</span>
            <span class="font-medium text-gray-500">{{ qrData.pricing.service_fee_amount | currency:'ARS':'symbol':'1.2-2' }}</span>
          </div>
          
          <div class="border-t border-gray-200 my-2 pt-2">
            <div class="flex justify-between text-base font-bold">
              <span class="text-gray-900">Total a pagar</span>
              <span class="text-blue-600">{{ qrData.pricing.total_amount | currency:'ARS':'symbol':'1.2-2' }}</span>
            </div>
          </div>
        </div>

        <div class="bg-green-50 rounded-lg p-3 mb-4">
          <p class="text-green-700 text-sm font-medium">
            El organizador recibe: {{ qrData.commission_info.organizer_net_amount | currency:'ARS':'symbol':'1.2-2' }}
          </p>
          <p class="text-green-600 text-xs mt-1">
            Sin comisiones para el organizador
          </p>
        </div>

        <!-- CODIGO QR VISUAL -->
        <div class="bg-white p-4 rounded-xl border-2 border-gray-100 mb-4">
          <img [src]="qrImageUrl" 
               alt="Codigo QR para pagar con MercadoPago"
               class="mx-auto w-48 h-48 object-contain"
               (error)="onQRError()">
          <p class="text-xs text-gray-400 mt-2">Escanea con la app de MercadoPago</p>
        </div>

        <a [href]="qrData.init_point" 
           target="_blank"
           class="block w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-xl 
                  transition-all duration-200 mb-4 text-center">
          <span class="flex items-center justify-center gap-2">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            Pagar con MercadoPago
          </span>
        </a>

        <div class="bg-gray-50 rounded-lg p-4 text-left">
          <p class="text-sm font-medium text-gray-700 mb-2">Como pagar?</p>
          <ol class="text-sm text-gray-600 space-y-1 list-decimal list-inside">
            <li>Abri la app de MercadoPago</li>
            <li>Toca el boton Escanear QR</li>
            <li>Apunta la camara al codigo de arriba</li>
            <li>Confirma el pago</li>
          </ol>
        </div>

        <div class="mt-4 pt-4 border-t border-gray-200 text-left">
          <p class="text-xs font-bold text-gray-400 uppercase mb-2">Detalle de comisiones</p>
          
          <div class="flex justify-between text-xs mb-1">
            <span class="text-gray-500">Comisión MP ({{ qrData.commission_info.mp_commission_percent }}%)</span>
            <span class="text-gray-500">{{ qrData.commission_info.mp_commission_amount | currency:'ARS':'symbol':'1.2-2' }}</span>
          </div>
          
          <div class="flex justify-between text-sm mt-2 pt-2 border-t border-gray-100">
            <span class="text-gray-700 font-medium">Ingreso para el organizador</span>
            <span class="font-bold text-green-600">{{ qrData.commission_info.organizer_net_amount | currency:'ARS':'symbol':'1.2-2' }}</span>
          </div>
        </div>
      </div>

      <div *ngIf="error && !loading" class="text-center py-4">
        <p class="text-red-500 text-sm">{{ error }}</p>
        <button (click)="generateQR()" 
                class="mt-3 text-blue-600 hover:text-blue-800 text-sm font-medium">
          Intentar nuevamente
        </button>
      </div>

      <button (click)="close.emit()" 
              class="mt-4 w-full text-gray-400 hover:text-gray-600 text-sm">
        Cancelar
      </button>
    </div>
  `,
  styles: [`
    .qr-payment-container {
      max-width: 400px;
      margin: 0 auto;
    }
  `]
})
export class QrPaymentComponent implements OnInit {
  private paymentService = inject(PaymentService);
  private toast = inject(ToastService);

  @Input() ticketTypeId!: number;
  @Input() quantity: number = 1;
  @Input() unitPrice: number = 0;
  
  @Output() close = new EventEmitter<void>();
  @Output() paymentInitiated = new EventEmitter<string>();

  loading = false;
  qrData: QRPreferenceResponse | null = null;
  qrImageUrl: string = '';
  error: string | null = null;

  ngOnInit() {
    this.generateQR();
  }

  generateQR() {
    this.loading = true;
    this.error = null;
    this.qrImageUrl = '';

    this.paymentService.createQRPreference(this.ticketTypeId, this.quantity).subscribe({
      next: (response) => {
        this.loading = false;
        if (response.success) {
          this.qrData = response;
          // Generar la imagen QR usando Google Charts API
          this.qrImageUrl = generateQRDataUrl(response.init_point, 200);
          this.paymentInitiated.emit(response.id);
          // No abrir ventana automaticamente, el usuario escanea el QR
        } else {
          this.error = 'Error al generar el pago';
          this.toast.error('No se pudo generar el codigo QR');
        }
      },
      error: (err) => {
        this.loading = false;
        this.error = err.error?.message || 'Error al generar QR';
        this.toast.error(this.error!);
      }
    });
  }

  onQRError() {
    // Si falla la carga de la imagen QR, mostrar mensaje alternativo
    this.qrImageUrl = '';
    this.toast.error('No se pudo cargar el codigo QR. Intenta con el boton de abajo.');
  }

  getTotal(): number {
    return this.unitPrice * this.quantity;
  }
}
