import { Component, OnInit } from '@angular/core';
import { HeaderComponent } from '../header/header.component';
import { AccesService } from '../../services/acces.service';
import { Router } from '@angular/router';
import { EventServiceService } from '../../services/event.service.service';
import { Evento } from '../../interfaces/event.js';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [HeaderComponent, CommonModule],
  templateUrl: './perfil.component.html',
  styleUrl: './perfil.component.css'
})


export class PerfilComponent implements OnInit {
  userProfile: any = {};
  eventos: Evento[] = [];
  tieneEventos: boolean = false;
  esAdmin: boolean = false;

  constructor(private profileService: AccesService, private router: Router, private eventoService: EventServiceService) { }

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token) {
        this.profileService.getProfile().subscribe({
          next: (data) => {
            this.userProfile = data;
            if (data.rol == "admin") {
              this.esAdmin = true
            }
          },
          error: (err) => {
            console.error('Error al obtener el perfil:', err);
            this.router.navigate(['/login']); // Redirige a login si hay un error
          },
        });
      } else {
        this.router.navigate(['/login']); // Redirige a login si no hay token
      }
    }

    this.verificarEventos();
  }

  verificarEventos() {
    this.eventoService.obtenerEventosUsuario().subscribe({
      next: (data) => {
        this.eventos = data;
        this.tieneEventos = data && data.length > 0;
      },
      error: (err) => {
        console.error('Error al obtener los eventos:', err);
      },
    });
  }


  panelAdmin() {
    this.router.navigate(['/admin'])
  }

  editProfile() {
    this.router.navigate([`/profile/${this.userProfile.id}`]);
  }

  showOrders() {
    this.router.navigate(['/my-tickets', this.userProfile.id]);
  }




  crearEvento(): void {
    const token = localStorage.getItem('token');
    if (token) {
      this.router.navigate(['/create-event']);
    } else {
      this.router.navigate(['/login']);
    }
  }

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('cachedProfile');
    this.router.navigate(['/']);
  }

  misEventos() {
    this.router.navigate(['/my-events']);
  }

}