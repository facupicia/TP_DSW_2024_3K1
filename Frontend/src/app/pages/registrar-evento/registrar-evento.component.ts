import { Component, inject, AfterViewInit, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router'; // Importamos ActivatedRoute
import { EventService } from '../../services/event.service';
import { Evento } from '../../interfaces/event';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../../components/header/header.component';
import { CategoryService } from '../../services/category.service';
import { Categoria } from '../../interfaces/categoria';
import { AuthService } from '../../services/auth.service';
import { HttpClient } from '@angular/common/http';
import { debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

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

  // Estados de la vista
  public isEditMode: boolean = false;
  public eventId: number | null = null;
  public pageTitle: string = 'Nuevo Evento.';
  public pageSubtitle: string = 'Diseña tu próxima experiencia.';
  public submitButtonText: string = 'Publicar Evento';

  public feedbackMessage: string = '';
  public feedbackSuccess: boolean = false;
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
    price: ['', [Validators.required, Validators.min(0)]],
    organizer: ['Organizer', Validators.required],
    capacity: ['', [Validators.required, Validators.min(10)]],
  });

  ngOnInit(): void {
    // 1. Cargar Categorías
    this.categoryService.getCategories().subscribe(
      (data) => this.categories = data,
      (error) => console.error('Error al obtener categorías:', error)
    );

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
      }
    });

    // 4. Lógica de Autocompletado de Mapa
    this.setupLocationSearch();
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
          time: evento.time, // Asumiendo formato HH:mm
          location: evento.location,
          image: evento.image,
          price: evento.price,
          organizer: evento.organizer,
          capacity: evento.capacity,
          category: evento.categoryId // Asegúrate que tu backend devuelva categoryId
        });
        
        // Si quisieras centrar el mapa en la ubicación guardada, podrías llamar a una función aquí
        // this.geocodeAndSetMap(evento.location);
      },
      error: (err) => {
        console.error(err);
        this.mostrarFeedback('Error al cargar el evento', false);
        setTimeout(() => this.router.navigate(['/my-events']), 2000);
      }
    });
  }

  setupLocationSearch() {
    this.formRegistroEvento.get('location')?.valueChanges.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      switchMap(query => {
        if (query && query.length > 3 && this.showSuggestions) {
          return this.http.get<any[]>(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=5`);
        }
        return of([]);
      }),
      catchError(() => of([]))
    ).subscribe(results => {
      this.locationSuggestions = results;
    });
  }

  // --- LOGICA DE MAPA (Leaflet) ---
  ngAfterViewInit(): void {
    if (typeof window !== 'undefined') {
      import('leaflet').then(L => {
        this.initMap(L);
      });
    }
  }

  private initMap(L: any): void {
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

  private getAddress(lat: number, lng: number) {
    this.http.get<any>(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
      .subscribe({
        next: (data) => {
          if (data && data.display_name) {
            this.formRegistroEvento.patchValue({ location: data.display_name }, { emitEvent: false });
          }
        }
      });
  }

  // --- SUBMIT (Crear o Editar) ---
  onSubmit() {
    if (this.formRegistroEvento.invalid) {
      this.formRegistroEvento.markAllAsTouched();
      return;
    }
    if (this.isSubmitting) return;

    if (!this.userId) {
      this.mostrarFeedback('Debes iniciar sesión.', false);
      return;
    }

    this.isSubmitting = true;

    const formValue = this.formRegistroEvento.value;
    const selectedCategory = this.categories.find(c => c.id == formValue.category);

    const eventData: Evento = {
      destacado: false, // Opcional: podrías agregar un check en el form
      user_id: this.userId,
      title: formValue.title,
      description: formValue.description,
      date: formValue.date,
      time: formValue.time,
      location: formValue.location,
      image: formValue.image,
      price: formValue.price,
      organizer: formValue.organizer,
      capacity: formValue.capacity,
      categoryId: formValue.category,
      categoria_name: selectedCategory ? selectedCategory.name : ''
    };

    if (this.isEditMode && this.eventId) {
      // ACTUALIZAR
      this.eventService.actualizarEvento(this.eventId, eventData).subscribe({
        next: () => {
          this.mostrarFeedback('Evento actualizado correctamente', true);
          setTimeout(() => this.router.navigate(['/my-events']), 1500);
        },
        error: (err) => {
          this.mostrarFeedback('Error al actualizar', false);
          this.isSubmitting = false;
        }
      });
    } else {
      // CREAR
      this.eventService.crearEvento(eventData).subscribe({
        next: () => {
          this.mostrarFeedback('Evento creado con éxito!', true);
          setTimeout(() => this.router.navigate(['/my-events']), 1500); // Mejor ir a 'Mis Eventos'
        },
        error: (err) => {
          this.mostrarFeedback('Error al crear', false);
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

  private mostrarFeedback(mensaje: string, esExito: boolean) {
    this.feedbackMessage = mensaje;
    this.feedbackSuccess = esExito;
    setTimeout(() => { this.feedbackMessage = ''; }, 3000);
  }
}