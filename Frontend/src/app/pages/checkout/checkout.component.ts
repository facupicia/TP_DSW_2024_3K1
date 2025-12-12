import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { EventService } from '../../services/event.service';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TicketService } from '../../services/ticket.service';
import { Ticket } from '../../interfaces/ticket';
import { HeaderComponent } from '../../components/header/header.component';

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

  private eventId: string | null = null;
  evento: any;
  ticketQuantity: number = 1; // Cantidad inicial
  total: number = 0; // Total inicial
  loading = false;
  showSuccessMessage = false;
  showErrorMessage = false;

  public formCheckout: FormGroup = this.formBuild.group({
    quantity: [1, [Validators.required, Validators.min(1)]]
  });

  showMessage: boolean = false;
  message: string = '';

  ngOnInit(): void {
    this.eventId = this.route.snapshot.paramMap.get('id');

    if (this.eventId) {
      this.eventoService.obtenerEvento(Number(this.eventId)).subscribe((evento) => {
        this.evento = evento;
        this.calculateTotal(); // Calcula el total al cargar el evento
      });
    }
  }

  // Incrementa la cantidad de entradas
  incrementQuantity() {
    this.ticketQuantity++;
    this.calculateTotal();
  }

  // Decrementa la cantidad de entradas (con un límite mínimo de 1)
  decrementQuantity() {
    if (this.ticketQuantity > 1) {
      this.ticketQuantity--;
      this.calculateTotal();
    }
  }

  // Calcula el total basado en `ticketQuantity` y `evento.price`
  calculateTotal() {
    this.total = this.ticketQuantity * (this.evento?.price || 0);
  }

  // Actualiza el total cuando cambia manualmente la cantidad en el formulario
  actualizarTotal() {
    const cantidad = this.formCheckout.value.quantity;
    this.ticketQuantity = cantidad;
    this.calculateTotal();
  }

  // Procesa la compra de tickets
  comprarTickets() {
    this.showSuccessMessage = false;
    this.showErrorMessage = false;

    if (!this.formCheckout.valid) {
      console.error('Formulario incompleto o inválido');
      return;
    }

    this.loading = true;

    const token = localStorage.getItem('token');
    const cantidadDeTickets = this.ticketQuantity; // Utiliza `ticketQuantity`
    const cantidadValida = Number.isInteger(cantidadDeTickets) && cantidadDeTickets > 0;

    if (token && this.eventId && cantidadValida) {
      this.ticketService.comprarTicket({ cantidad: cantidadDeTickets }, Number(this.eventId)).subscribe({
        next: (response) => {
          console.log('Boletos comprados:', response);
          this.showSuccessMessage = true;
        },
        error: (error) => {
          console.error('Error al comprar tickets:', error);
          this.showErrorMessage = true;
        },
        complete: () => {
          this.loading = false;
        }
      });
    } else {
      this.loading = false;
    }
  }

  crearEvento(): void {
    const token = localStorage.getItem('token');
    if (token) {
      this.router.navigate(['/create-event']);
    } else {
      this.router.navigate(['/login']);
    }
  }

  mostrarMensaje() {
    this.showMessage = true;
    this.message = '¡Compra realizada con éxito!';
    setTimeout(() => {
      this.showMessage = false;
    }, 5000);
  }
}
