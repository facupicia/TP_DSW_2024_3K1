import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { EventService } from '../../services/event.service';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TicketService } from '../../services/ticket.service';
import { HeaderComponent } from '../../components/header/header.component';
import { interval, Subscription } from 'rxjs';

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

  timeLeft: number = 600; // 10 minutos en segundos
  timerDisplay: string = '10:00';
  private timerSubscription!: Subscription;
  // Simulación de capacidad real (esto vendría del evento)
  ticketsRestantes: number = 100; // Juega con este nro para probar la etique

  private eventId: string | null = null;
  evento: any;
  ticketQuantity: number = 1;
  total: number = 0;
  loading = false;
  showSuccessMessage = false;
  showErrorMessage = false;
  errorMessageText = '';
  paymentStatus: 'idle' | 'processing' | 'success' | 'failure' = 'idle';

  public formCheckout: FormGroup = this.formBuild.group({
    quantity: [1, [Validators.required, Validators.min(1)]]
  });

  ngOnInit(): void {
    this.eventId = this.route.snapshot.paramMap.get('id');

    if (this.eventId) {
      this.eventoService.obtenerEvento(Number(this.eventId)).subscribe((evento) => {
        this.evento = evento;
        this.calculateTotal();
      });
    }

    // Iniciar el temporizador apenas carga el checkout
    this.startTimer();
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
    this.ticketQuantity++;
    this.updateFormAndTotal();
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
    if (this.evento) {
      this.total = this.ticketQuantity * this.evento.price;
    }
  }

  comprarTickets() {
    this.showSuccessMessage = false;
    this.showErrorMessage = false;
    this.errorMessageText = '';
    this.paymentStatus = 'idle';

    if (!this.formCheckout.valid) return;

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
      this.ticketService.comprarTicket({ cantidad: this.ticketQuantity }, Number(this.eventId)).subscribe({
        next: (response: any) => {
          if (response.init_point) {
            window.location.href = response.init_point;
          } else {
            console.error('No se recibió init_point de Mercado Pago');
            this.showErrorMessage = true;
            this.loading = false;
            this.paymentStatus = 'failure';
            this.errorMessageText = 'No se pudo iniciar el pago. Intenta nuevamente.';
          }
        },
        error: (error) => {
          console.error('Error al generar preferencia:', error);
          this.showErrorMessage = true;
          this.loading = false;
          this.paymentStatus = 'failure';
          this.errorMessageText = error.userMessage || 'Ocurrió un error al generar la preferencia';
        }
      });
    }
  }
}
