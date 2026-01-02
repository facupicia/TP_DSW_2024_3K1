import { Component, ElementRef, Input, ViewChild, HostListener,EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-ticket-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ticket-card.component.html',
  styleUrls: ['./ticket-card.component.css']
})
export class TicketCardComponent {
  @Input() ticket: any;
  @Input() group: any; // Datos del evento (título, fecha, imagen)
  @Output() onShare = new EventEmitter<any>(); // <--- Nuevo Output

  @ViewChild('card') card!: ElementRef;
  
  // Variables para la transformación 3D
  rotateX = 0;
  rotateY = 0;
  shineX = 0;
  shineY = 0;
  isActive = false;

  compartir() { 
      // En vez de la lógica vieja, avisamos al padre
      this.onShare.emit(); 
  }

  // Lógica de Movimiento 3D (Mouse Move)
  onMouseMove(e: MouseEvent) {
    if (window.innerWidth < 768) return;
    if (!this.card) return;
    
    const rect = this.card.nativeElement.getBoundingClientRect();
    const x = e.clientX - rect.left; // Posición X dentro de la tarjeta
    const y = e.clientY - rect.top;  // Posición Y dentro de la tarjeta
    
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Calculamos rotación (limitada a +/- 20 grados para que sea sutil)
    this.rotateY = ((x - centerX) / centerX) * 15; 
    this.rotateX = ((centerY - y) / centerY) * 15;

    // Calculamos la posición del brillo (Shine)
    this.shineX = (x / rect.width) * 100;
    this.shineY = (y / rect.height) * 100;
    
    this.isActive = true;
  }

  // Resetear al salir
  onMouseLeave() {
    this.rotateX = 0;
    this.rotateY = 0;
    this.isActive = false;
  }


}