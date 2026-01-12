import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { EventService } from '../../services/event.service';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TicketService } from '../../services/ticket.service';
import { HeaderComponent } from '../../components/header/header.component';
import { interval, Subscription } from 'rxjs';
import { TicketType } from '../../interfaces/event';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, HeaderComponent],
  templateUrl: './checkout.component.html',
  styleUrls: ['./checkout.component.css']
})
export class CheckoutComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  public formBuild = inject(FormBuilder);
  private eventoService = inject(EventService);
  private ticketService = inject(TicketService);
  private toastService = inject(ToastService);

  timeLeft: number = 600; // 10 minutos en segundos
  timerDisplay: string = '10:00';
  private timerSubscription!: Subscription;

  ticketsRestantes: number = 100; // Será actualizado con el stock real del tipo

  private eventId: string | null = null;
  evento: any;
  ticketTypes: TicketType[] = [];
  selectedTicketType: TicketType | null = null;

  ticketQuantity: number = 1;
  total: number = 0;
  loading = false;
  showSuccessMessage = false;
  showErrorMessage = false;
  errorMessageText = '';
  paymentStatus: 'idle' | 'processing' | 'success' | 'failure' = 'idle';

  public formCheckout: FormGroup = this.formBuild.group({
    ticketTypeId: ['', Validators.required],
    quantity: [1, [Validators.required, Validators.min(1)]]
  });

  ngOnInit(): void {
    this.eventId = this.route.snapshot.paramMap.get('id');

    if (!this.eventId || isNaN(Number(this.eventId)) || Number(this.eventId) <= 0) {
      this.router.navigate(['/']);
      return;
    }
    this.eventoService.obtenerEvento(Number(this.eventId)).subscribe((evento) => {
      this.evento = evento;
      this.ticketTypes = evento.ticketTypes || [];

      // Auto-select first active ticket type
      if (this.ticketTypes.length > 0) {
        const firstActive = this.ticketTypes.find(t => t.status === 'active');
        if (firstActive) {
          this.formCheckout.patchValue({ ticketTypeId: firstActive.id });
          this.onTicketTypeChange(firstActive.id!);
        }
      } else {
        // Fallback for legacy events without ticketTypes (should not happen with new logic)
        this.selectedTicketType = {
          id: 0,
          name: 'Entrada General',
          price: evento.price || 0,
          capacity: evento.capacity || 100,
          status: 'active'
        };
        this.calculateTotal();
      }
    });

    // Escuchar cambios en el tipo de ticket
    this.formCheckout.get('ticketTypeId')?.valueChanges.subscribe(id => {
      this.onTicketTypeChange(Number(id));
    });

    // Iniciar el temporizador apenas carga el checkout
    this.startTimer();
  }

  onTicketTypeChange(id: number) {
    this.selectedTicketType = this.ticketTypes.find(t => t.id == id) || null;
    if (this.selectedTicketType) {
      this.ticketsRestantes = this.selectedTicketType.capacity - (this.selectedTicketType.soldCount || 0);
      this.calculateTotal();
    }
  }

  ngOnDestroy(): void {
    // Limpiar timer al salir
    if (this.timerSubscription) this.timerSubscription.unsubscribe();
  }

  // 1. LOGICA TEMPORIZADOR
  startTimer() {
    this.timerSubscription = interval(1000).subscribe(() => {
      if (this.timeLeft > 0) {
        this.timeLeft--;
        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = this.timeLeft % 60;
        this.timerDisplay = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
      } else {
        // Tiempo agotado: Redirigir o mostrar alerta
        this.showErrorMessage = true; // Reusamos tu variable de error
        this.formCheckout.disable(); // Deshabilitar compra
      }
    });
  }

  // 2. LOGICA DE ESCASEZ (Getter inteligente)
  get scarcityLabel(): { text: string, color: string } | null {
    // Si quedan menos de 20 entradas, mostramos alerta roja
    if (this.ticketsRestantes < 20) {
      return { text: '¡Solo quedan unas pocas!', color: 'text-red-600 bg-red-50 border-red-100' };
    }
    // Si quedan menos de 100, alerta amarilla
    if (this.ticketsRestantes < 100) {
      return { text: 'Alta demanda 🔥', color: 'text-orange-600 bg-orange-50 border-orange-100' };
    }
    // Si hay muchas, no mostramos nada (null)
    return null;
  }



  incrementQuantity() {
    if (this.selectedTicketType && this.ticketQuantity < this.ticketsRestantes) {
      this.ticketQuantity++;
      this.updateFormAndTotal();
    }
  }

  decrementQuantity() {
    if (this.ticketQuantity > 1) {
      this.ticketQuantity--;
      this.updateFormAndTotal();
    }
  }

  updateFormAndTotal() {
    this.formCheckout.patchValue({ quantity: this.ticketQuantity });
    this.calculateTotal();
  }

  calculateTotal() {
    if (this.selectedTicketType) {
      this.total = this.ticketQuantity * this.selectedTicketType.price;
    } else if (this.evento && !this.ticketTypes.length) {
      // Legacy fallback
      this.total = this.ticketQuantity * (this.evento.price || 0);
    }
  }

  comprarTickets() {
    this.showSuccessMessage = false;
    this.showErrorMessage = false;
    this.errorMessageText = '';
    this.paymentStatus = 'idle';

    if (!this.formCheckout.valid) return;
    if (!this.selectedTicketType && this.ticketTypes.length > 0) return;

    this.loading = true;
    this.paymentStatus = 'processing';
    const token = localStorage.getItem('token');

    // Si no está logueado, redirigir
    if (!token) {
      this.router.navigate(['/login']);
      return;
    }

    if (this.eventId) {
      // 3. LOGICA MERCADO PAGO REAL
      const ticketTypeId = this.selectedTicketType?.id || 0; // 0 for legacy fallback? Backend requires ID now.

      this.ticketService.comprarTicket({ cantidad: this.ticketQuantity, ticketTypeId }).subscribe({
        next: (response: any) => {
          if (response.init_point) {
            try {
              const lastPurchase = {
                preferenceId: response.id,
                external_reference: response.external_reference,
                eventId: Number(this.eventId),
                ticketTypeId: ticketTypeId,
                quantity: this.ticketQuantity,
                at: Date.now()
              };
              if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.setItem('lastPurchase', JSON.stringify(lastPurchase));
              }
            } catch { }
            window.location.href = response.init_point;
          } else {
            this.toastService.error('No se pudo iniciar el pago. Intenta nuevamente.');
            this.showErrorMessage = true;
            this.loading = false;
            this.paymentStatus = 'failure';
          }
        },
        error: (error) => {
          // Error interceptor will show toast, but we also set component state
          this.showErrorMessage = true;
          this.loading = false;
          this.paymentStatus = 'failure';
        }
      });
    }
  }
}
