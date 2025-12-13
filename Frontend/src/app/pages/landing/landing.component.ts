import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common'; // Agregamos DatePipe para las fechas
import { Router, RouterLink } from '@angular/router'; // RouterLink es vital para el HTML

// Tus componentes (si los usas dentro, aunque ahora el HTML tiene el diseño directo)
import { HeaderComponent } from '../../components/header/header.component';
import { FooterComponent } from '../../components/footer/footer.component';
import { EventService } from '../../services/event.service';
import { Evento } from '../../interfaces/event';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [
    HeaderComponent,
    FooterComponent,
    CommonModule, // Para *ngFor, *ngIf
    RouterLink,   // Para routerLink=""
    DatePipe      // Para el pipe | date
  ],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.css']
})
export class LandingComponent implements OnInit {

  // Usamos una lista simple, sin grupos
  events: Evento[] = [];

  // Inyección de dependencias
  constructor(private eventService: EventService, private router: Router) { }

  ngOnInit(): void {
    // Carga simple y directa de datos
    this.eventService.obtenerEventos().subscribe((data) => {
      this.events = data;
      // ¡Adiós a this.groupEvents()! Ya no se necesita.
    });
  }

  navigateToEvent(id: number | undefined): void {
    if (id) {
      this.router.navigate(['/event', id]);
    }
  }

  crearEvento() {
    this.router.navigate(['/create-event']);
  }
}