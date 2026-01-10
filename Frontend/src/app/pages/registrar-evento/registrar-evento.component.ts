import { Component, inject, AfterViewInit, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormArray } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router'; // Importamos ActivatedRoute
import { EventService } from '../../services/event.service';
import { Evento, TicketType } from '../../interfaces/event';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../../components/header/header.component';
import { CategoryService } from '../../services/category.service';
import { Categoria } from '../../interfaces/categoria';
import { AuthService } from '../../services/auth.service';
import { HttpClient } from '@angular/common/http';
import { debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-registrar-evento',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, HeaderComponent, RouterLink],
  templateUrl: './registrar-evento.component.html',
  styleUrls: ['./registrar-evento.component.css']
})
export class RegistrarEventoComponent implements OnInit, AfterViewInit {
  private eventService = inject(EventService);
  private categoryService = inject(CategoryService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute); // Inyección para leer URL
  private http = inject(HttpClient);
  public formBuild = inject(FormBuilder);
  private toastService = inject(ToastService);

  // Estados de la vista
  public isEditMode: boolean = false;
  public eventId: number | null = null;
  public pageTitle: string = 'Nuevo Evento.';
  public pageSubtitle: string = 'Diseña tu próxima experiencia.';
  public submitButtonText: string = 'Publicar Evento';

  public isSubmitting: boolean = false;
  public categories: Categoria[] = [];
  public userId: number | null = null;

  // Variables para mapa y autocompletado
  public locationSuggestions: any[] = [];
  public showSuggestions: boolean = false;
  private map: any;
  private marker: any;

  public formRegistroEvento: FormGroup = this.formBuild.group({
    category: ['', Validators.required],
    title: ['', Validators.required],
    description: ['', [Validators.required, Validators.maxLength(500)]],
    date: ['', [Validators.required]],
    time: ['', Validators.required],
    location: ['', Validators.required],
    image: ['', [Validators.pattern(/^https?:\/\/.+/)]],
    organizer: ['Organizer', Validators.required],
    minAge: [0], // 0 = sin restricción, 18 = +18, etc.
    ticketTypes: this.formBuild.array([])
  });

  get ticketTypes() {
    return this.formRegistroEvento.get('ticketTypes') as FormArray;
  }

  ngOnInit(): void {
    // 1. Cargar Categorías
    this.categoryService.getCategories().subscribe({
      next: (data) => this.categories = data
      // Error handled by interceptor
    });

    // 2. Obtener Perfil de Usuario (necesario para el ID)
    this.authService.getProfile().subscribe({
      next: (data) => {
        if (data) {
          this.userId = data.id;
          // Solo ponemos el nombre del organizador si estamos CREANDO
          if (!this.isEditMode) {
            this.formRegistroEvento.patchValue({ organizer: `${data.firstname} ${data.lastname}` });
          }
        }
      }
    });

    // 3. DETECTAR SI ES EDICIÓN O CREACIÓN
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');

      if (id) {
        // --- MODO EDICIÓN ---
        this.isEditMode = true;
        this.eventId = Number(id);
        this.pageTitle = 'Editar Evento.';
        this.pageSubtitle = 'Ajusta los detalles de tu evento.';
        this.submitButtonText = 'Guardar Cambios';
        this.loadEventData(this.eventId);
      } else {
        // --- MODO CREACIÓN ---
        this.isEditMode = false;
        this.pageTitle = 'Nuevo Evento.';
        this.pageSubtitle = 'Diseña tu próxima experiencia.';
        this.submitButtonText = 'Publicar Evento';
        // Add one default ticket type
        this.addTicketType();
      }
    });

    // 4. Lógica de Autocompletado de Mapa
    this.setupLocationSearch();
  }

  addTicketType(data?: TicketType) {
    const group = this.formBuild.group({
      id: [data?.id || null],
      name: [data?.name || 'General', Validators.required],
      price: [data?.price || 0, [Validators.required, Validators.min(0)]],
      capacity: [data?.capacity || 100, [Validators.required, Validators.min(1)]],
      description: [data?.description || ''],
      active: [data?.active ?? true]
    });
    this.ticketTypes.push(group);
  }

  removeTicketType(index: number) {
    this.ticketTypes.removeAt(index);
  }

  // Carga los datos existentes al formulario
  loadEventData(id: number) {
    this.eventService.obtenerEvento(id).subscribe({
      next: (evento) => {
        // Formatear fecha para input type="date" (YYYY-MM-DD)
        const dateStr = new Date(evento.date).toISOString().split('T')[0];

        this.formRegistroEvento.patchValue({
          title: evento.title,
          description: evento.description,
          date: dateStr,
          time: evento.time,
          location: evento.location,
          image: evento.image,
          organizer: evento.organizer,
          category: evento.categoryId,
          minAge: evento.minAge || 0
        });

        // Load Ticket Types
        this.ticketTypes.clear();
        if (evento.ticketTypes && evento.ticketTypes.length > 0) {
          evento.ticketTypes.forEach(tt => this.addTicketType(tt));
        } else {
          // Fallback if no ticket types (should not happen in new logic, but for safety)
          this.addTicketType({
            name: 'Entrada General',
            price: evento.price || 0,
            capacity: evento.capacity || 100
          } as TicketType);
        }

        // Si quisieras centrar el mapa en la ubicación guardada, podrías llamar a una función aquí
        // this.geocodeAndSetMap(evento.location);
      },
      error: () => {
        // Error message handled by interceptor
        setTimeout(() => this.router.navigate(['/my-events']), 2000);
      }
    });
  }

  // Modifica setupLocationSearch
  setupLocationSearch() {
    this.formRegistroEvento.get('location')?.valueChanges.pipe(
      debounceTime(1000), // AUMENTA ESTO: Nominatim pide máximo 1 petición por segundo
      distinctUntilChanged(),
      switchMap(query => {
        if (query && query.length > 3 && this.showSuggestions) {
          // AGREGA &email=tu@email.com
          return this.http.get<any[]>(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=5&addressdetails=1&email=tu_contacto@tudominio.com`);
        }
        return of([]);
      }),
      catchError(() => of([]))
    ).subscribe(results => {
      this.locationSuggestions = results;
    });
  }

  // Modifica getAddress (Geocodificación inversa)
  private getAddress(lat: number, lng: number) {
    // AGREGA &email=tu@email.com
    this.http.get<any>(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&email=tu_contacto@tudominio.com`)
      .subscribe({
        next: (data) => {
          if (data && data.display_name) {
            this.formRegistroEvento.patchValue({ location: data.display_name }, { emitEvent: false });
          }
        }
      });
  }

  // --- LOGICA DE MAPA (Leaflet) ---
  ngAfterViewInit(): void {
    if (typeof window !== 'undefined') {
      import('leaflet').then((module) => {
        // SOLUCIÓN: Leaflet a veces viene encapsulado en 'default'
        const L = module.default || module;
        this.initMap(L);
      });
    }
  }

  private initMap(L: any): void {
    // 1. CORRECCIÓN DE ICONOS PARA PRODUCCIÓN
    // Definimos los iconos manualmente para evitar que salgan rotos al compilar
    const iconDefault = L.icon({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });

    // Forzamos al prototipo de Marker a usar este icono
    L.Marker.prototype.options.icon = iconDefault;

    // 2. INICIALIZAR MAPA
    this.map = L.map('map').setView([-31.4161, -64.1867], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(this.map);

    this.map.on('click', (e: any) => {
      const { lat, lng } = e.latlng;
      if (this.marker) this.marker.setLatLng([lat, lng]);
      else this.marker = L.marker([lat, lng]).addTo(this.map);
      this.getAddress(lat, lng);
    });
  }

  onInputLocation() { this.showSuggestions = true; }

  closeSuggestions() { setTimeout(() => { this.showSuggestions = false; }, 200); }

  selectAddress(item: any) {
    this.showSuggestions = false;
    this.formRegistroEvento.patchValue({ location: item.display_name }, { emitEvent: false });
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);

    if (this.map) {
      this.map.setView([lat, lng], 16);
      if (this.marker) this.marker.setLatLng([lat, lng]);
      // Simulamos click para consistencia (opcional si ya importaste L)
    }
  }


  // --- SUBMIT (Crear o Editar) ---
  onSubmit() {
    if (this.formRegistroEvento.invalid) {
      this.formRegistroEvento.markAllAsTouched();
      return;
    }
    if (this.isSubmitting) return;

    if (!this.userId) {
      this.toastService.warning('Debes iniciar sesión.');
      return;
    }

    if (this.ticketTypes.length === 0) {
      this.toastService.warning('Debes agregar al menos un tipo de entrada.');
      return;
    }

    this.isSubmitting = true;

    const formValue = this.formRegistroEvento.value;
    const selectedCategory = this.categories.find(c => c.id == formValue.category);

    const eventData: Evento = {
      destacado: false,
      user_id: this.userId,
      title: formValue.title,
      description: formValue.description,
      date: formValue.date,
      time: formValue.time,
      location: formValue.location,
      image: formValue.image,
      organizer: formValue.organizer,
      categoryId: Number(formValue.category),
      categoria_name: selectedCategory ? selectedCategory.name : '',
      minAge: Number(formValue.minAge) || 0,
      ticketTypes: formValue.ticketTypes
    };

    if (this.isEditMode && this.eventId) {
      // ACTUALIZAR
      this.eventService.actualizarEvento(this.eventId, eventData).subscribe({
        next: () => {
          this.toastService.success('Evento actualizado correctamente');
          setTimeout(() => this.router.navigate(['/my-events']), 1500);
        },
        error: () => {
          // Error message handled by interceptor
          this.isSubmitting = false;
        }
      });
    } else {
      // CREAR
      this.eventService.crearEvento(eventData).subscribe({
        next: () => {
          this.toastService.success('Evento creado con éxito!');
          setTimeout(() => this.router.navigate(['/my-events']), 1500);
        },
        error: () => {
          // Error message handled by interceptor
          this.isSubmitting = false;
        }
      });
    }
  }

  // Helpers
  getCategoryName(id: string): string {
    if (!id) return 'Categoría';
    const cat = this.categories.find(c => c.id == Number(id));
    return cat ? cat.name : 'Categoría';
  }


  // Helper para preview de precio
  getMinPrice(): number {
    const types = this.ticketTypes.value;
    if (!types || types.length === 0) return 0;
    return Math.min(...types.map((t: any) => t.price));
  }
}