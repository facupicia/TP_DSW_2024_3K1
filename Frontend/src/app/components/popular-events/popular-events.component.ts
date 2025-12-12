import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EventService } from '../../services/event.service';
@Component({
  selector: 'app-popular-events',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './popular-events.component.html',
  styleUrl: './popular-events.component.css'
})
export class PopularEventsComponent {
  private eventService = inject(EventService);
  events: any[] = [];
  eventGroups: any[][] = [];

  ngOnInit(): void {
    this.eventService.obtenerEventos().subscribe((data) => {
      this.events = data;
      this.groupEvents();
    });
  }

  groupEvents(): void {
    for (let i = 0; i < this.events.length; i += 3) {
      this.eventGroups.push(this.events.slice(i, i + 3));
    }
  }
}
