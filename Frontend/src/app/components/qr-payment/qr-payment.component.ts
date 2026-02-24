import { Component, Input, Output, EventEmitter, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PaymentService, QRPreferenceResponse } from '../../services/payment.service';
import { ToastService } from '../../services/toast.service';

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
        <p class="text-sm text-gray-500 mt-1">Escanea el codigo con la app de MercadoPago</p>
      </div>

      <div *ngIf="loading" class="text-center py-8">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p class="text-gray-500 mt-4">Generando codigo QR...</p>
      </div>

      <div *ngIf="qrData && !loading" class="text-center">
        
        <div class="bg-green-50 rounded-lg p-3 mb-4">
          <p class="text-green-700 text-sm font-medium">
            Comision reducida: {{ qrData.commission_info.mp_commission_percent }}%
          </p>
          <p class="text-green-600 text-xs mt-1">
            Ahorras vs el metodo tradicional
          </p>
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
            <li>Escanea el codigo o usa el boton de arriba</li>
            <li>Confirma el pago</li>
          </ol>
        </div>

        <div class="mt-4 pt-4 border-t border-gray-200">
          <div class="flex justify-between text-sm">
            <span class="text-gray-500">Total a pagar:</span>
            <span class="font-bold text-gray-900">{{ getTotal() | currency:'ARS':'symbol':'1.2-2' }}</span>
          </div>
          <div class="flex justify-between text-xs mt-1">
            <span class="text-gray-400">Comision MP ({{ qrData.commission_info.mp_commission_percent }}%):</span>
            <span class="text-gray-500">-{{ qrData.commission_info.mp_commission_amount | currency:'ARS':'symbol':'1.2-2' }}</span>
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
  error: string | null = null;

  ngOnInit() {
    this.generateQR();
  }

  generateQR() {
    this.loading = true;
    this.error = null;

    this.paymentService.createQRPreference(this.ticketTypeId, this.quantity).subscribe({
      next: (response) => {
        this.loading = false;
        if (response.success) {
          this.qrData = response;
          this.paymentInitiated.emit(response.id);
          window.open(response.init_point, '_blank');
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

  getTotal(): number {
    return this.unitPrice * this.quantity;
  }
}
