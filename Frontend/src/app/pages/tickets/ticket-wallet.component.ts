import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TicketFlipCardComponent, TicketDisplayStatus } from './ticket-flip-card.component';

export interface WalletItem {
  ticket: any;
  group: any;
  status: TicketDisplayStatus;
}

@Component({
  selector: 'app-ticket-wallet',
  standalone: true,
  imports: [CommonModule, TicketFlipCardComponent],
  templateUrl: './ticket-wallet.component.html',
  styleUrls: ['./ticket-wallet.component.css']
})
export class TicketWalletComponent {
  @Input() title = 'Mis Entradas';
  @Input() subtitle = 'Deslizá para explorar';
  @Input() items: WalletItem[] = [];
  @Input() status: TicketDisplayStatus = 'active';

  onShare(item: WalletItem) {
    // Re-emitir para que el padre maneje el share
    // Usamos un evento custom en el DOM para simplificar
    const event = new CustomEvent('ticketShare', {
      detail: { ticket: item.ticket, group: item.group },
      bubbles: true
    });
    document.dispatchEvent(event);
  }
}
