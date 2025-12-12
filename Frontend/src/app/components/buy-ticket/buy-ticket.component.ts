import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-buy-ticket',
  standalone: true,
  imports: [],
  templateUrl: './buy-ticket.component.html',
  styleUrl: './buy-ticket.component.css'
})
export class BuyTicketComponent {
  private router: Router = inject(Router);

  explorarEventos() {
    this.router.navigate(['/events']);
  }

}
