import { Component, inject, AfterViewInit, OnInit } from '@angular/core'; // Agregamos OnInit
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { EventService } from '../../services/event.service';
import { Evento } from '../../interfaces/event.js';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../../components/header/header.component';
import { CategoryService } from '../../services/category.service';
import { Categoria } from '../../interfaces/categoria';
import { AuthService } from '../../services/auth.service';
import { HttpClient } from '@angular/common/http'; // <--- IMPORTANTE
import { debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators'; // <--- IMPORTANTE
import { of } from 'rxjs';

@Component({
  selector: 'app-registrar-evento',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, HeaderComponent, RouterLink],
  templateUrl: './registrar-evento.component.html',
  styleUrls: ['./registrar-evento.component.css']
})
export class RegistrarEventoComponent implements OnInit, AfterViewInit {
  private EventService = inject(EventService);
  private categoryService = inject(CategoryService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private http = inject(HttpClient); // <--- INYECCIÓN
  public formBuild = inject(FormBuilder);

  public feedbackMessage: string = '';
  public feedbackSuccess: boolean = false;
  public isSubmitting: boolean = false;
  public categories: Categoria[] = [];
  public userId: number | null = null;

  // Variables para el autocompletado
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

    // 2. Obtener Perfil
    this.authService.getProfile().subscribe({
      next: (data) => {
        if (data) {
          this.userId = data.id;
          this.formRegistroEvento.patchValue({ organizer: `${data.firstname} ${data.lastname}` });
        }
      }
    });

    // 3. LOGICA DE BUSQUEDA (Autocompletado)
    this.formRegistroEvento.get('location')?.valueChanges.pipe(
      debounceTime(400), // Espera 400ms a que dejes de escribir
      distinctUntilChanged(),
      switchMap(query => {
        // Solo busca si hay más de 3 letras y NO estamos seleccionando una sugerencia (evita bucle)
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

  // Activa las sugerencias cuando el usuario escribe
  onInputLocation() {
    this.showSuggestions = true;
  }

  // Oculta las sugerencias con un pequeño delay para permitir el click
  closeSuggestions() {
    setTimeout(() => {
      this.showSuggestions = false;
    }, 200);
  }

  // CUANDO EL USUARIO ELIGE UNA DIRECCIÓN DE LA LISTA
  selectAddress(item: any) {
    this.showSuggestions = false;
    
    // 1. Poner texto en el input
    this.formRegistroEvento.patchValue({ location: item.display_name }, { emitEvent: false });
    
    // 2. Mover el mapa y el marcador
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    
    if (this.map) {
      this.map.setView([lat, lng], 16); // Zoom in
      
      if (this.marker) {
        this.marker.setLatLng([lat, lng]);
      } else {
        // Importante: Importar L dinámicamente si no está disponible globalmente, 
        // pero como ya lo usas en initMap, asumimos que el objeto mapa ya tiene acceso a L internamente 
        // o reutilizamos la lógica. Para asegurar, usamos la referencia al marker existente.
        // Si no hay marcador, habría que crearlo, pero Leaflet suele requerir 'L'.
        // Como solución rápida, simulamos un click en el mapa:
        this.map.fireEvent('click', { latlng: { lat, lng } });
      }
    }
  }

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
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    this.map.on('click', (e: any) => {
      const { lat, lng } = e.latlng;
      
      if (this.marker) {
        this.marker.setLatLng([lat, lng]);
      } else {
        this.marker = L.marker([lat, lng]).addTo(this.map);
      }
      
      // Llamamos a la API reversa solo si fue un click manual
      this.getAddress(lat, lng);
    });
  }

  private getAddress(lat: number, lng: number) {
    // Usamos HttpClient aquí también para consistencia
    this.http.get<any>(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
      .subscribe({
        next: (data) => {
          if (data && data.display_name) {
            // emitEvent: false evita que se dispare la búsqueda de texto nuevamente
            this.formRegistroEvento.patchValue({ location: data.display_name }, { emitEvent: false });
          }
        },
        error: (err) => console.error(err)
      });
  }

  // ... (Resto de tus funciones: getCategoryName, futureDateValidator, createEvent, mostrarFeedback) ...
  // Asegúrate de copiar las funciones auxiliares que ya tenías
  futureDateValidator(control: any) {
      if (!control.value) return null;
      const inputDate = new Date(control.value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return inputDate >= today ? null : { pastDate: true };
  }

  getCategoryName(id: string): string {
      if (!id) return 'Categoría';
      const cat = this.categories.find(c => c.id == Number(id));
      return cat ? cat.name : 'Categoría';
  }

  createEvent() {
    if (this.formRegistroEvento.invalid) {
      this.formRegistroEvento.markAllAsTouched();
      return;
    }
    // ... (Tu lógica de createEvent original)
    // ... asegúrate de copiarla tal cual la tenías
     if (this.isSubmitting) return;

    if (!this.userId) {
      this.mostrarFeedback('Debes iniciar sesión para crear un evento', false);
      setTimeout(() => this.router.navigate(['/login']), 2000);
      return;
    }

    this.isSubmitting = true;

    const selectedCategoryId = parseInt(this.formRegistroEvento.value.category, 10);
    const selectedCategory = this.categories.find(cat => cat.id === selectedCategoryId);

    if (!selectedCategory) {
      this.isSubmitting = false;
      return;
    }

    const objeto: Evento = {
      destacado: false,
      user_id: this.userId,
      title: this.formRegistroEvento.value.title,
      description: this.formRegistroEvento.value.description,
      date: this.formRegistroEvento.value.date,
      time: this.formRegistroEvento.value.time,
      location: this.formRegistroEvento.value.location,
      image: this.formRegistroEvento.value.image,
      price: this.formRegistroEvento.value.price,
      organizer: this.formRegistroEvento.value.organizer,
      capacity: this.formRegistroEvento.value.capacity,
      categoria_name: selectedCategory.name,
      categoryId: this.formRegistroEvento.value.category,
    };

    this.EventService.crearEvento(objeto).subscribe({
      next: (resp) => {
        this.mostrarFeedback('Evento creado con éxito!', true);
        setTimeout(() => {
          this.router.navigate(['/profile']);
        }, 1500);
      },
      error: (err) => {
        this.mostrarFeedback('Error al crear el evento', false);
        this.isSubmitting = false;
      }
    });
  }

  private mostrarFeedback(mensaje: string, esExito: boolean) {
      this.feedbackMessage = mensaje;
      this.feedbackSuccess = esExito;
      setTimeout(() => {
        this.feedbackMessage = '';
      }, 3000);
  }
}