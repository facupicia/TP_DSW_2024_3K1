import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { EventService } from '../../services/event.service';
import { Evento } from '../../interfaces/event.js';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../../components/header/header.component';
import { CategoryService } from '../../services/category.service';
import { Categoria } from '../../interfaces/categoria';

@Component({
  selector: 'app-registrar-evento',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, HeaderComponent],
  templateUrl: './registrar-evento.component.html',
  styleUrls: ['./registrar-evento.component.css']  // Changed to styleUrls
})
export class RegistrarEventoComponent {
  private EventService = inject(EventService);
  private categoryService = inject(CategoryService);
  private router = inject(Router);
  public formBuild = inject(FormBuilder);
  public feedbackMessage: string = '';
  public feedbackSuccess: boolean = false;

  public categories: Categoria[] = []; // Agregado para inicializar categories

  ngOnInit(): void {
    this.categoryService.getCategories().subscribe(
      (data) => {
        this.categories = data;
        console.log('Categorías cargadas:', this.categories); // Verifica que se cargan correctamente
      },
      (error) => {
        console.error('Error al obtener las categorías:', error);
      }
    );
  }

  public formRegistroEvento: FormGroup = this.formBuild.group({
    category: ['', Validators.required],
    title: ['', Validators.required],
    description: ['', [Validators.required, Validators.maxLength(500)]], // Permite hasta 500 caracteres
    date: ['', Validators.required],
    time: ['', Validators.required],
    location: ['', Validators.required],
    image: [''],
    price: ['', [Validators.required, Validators.min(0)]], // Precio debe ser positivo
    organizer: ['', Validators.required],
    capacity: ['', [Validators.required, Validators.min(10)]], // Capacidad mínima de 10
  });



  createEvent() {
    // Obtiene el id de la categoría desde el formulario
    const selectedCategoryId = parseInt(this.formRegistroEvento.value.category, 10);

    // Busca la categoría correspondiente en la lista de categorías
    const selectedCategory = this.categories.find(cat => cat.id === selectedCategoryId);

    if (!selectedCategory) {
      console.error('Categoría seleccionada no encontrada.');
      return;
    }

    const objeto: Evento = {
      destacado: this.formRegistroEvento.value.destacado,
      user_id: this.formRegistroEvento.value.user_id,
      title: this.formRegistroEvento.value.title,
      description: this.formRegistroEvento.value.description,
      date: this.formRegistroEvento.value.date,
      time: this.formRegistroEvento.value.time,
      location: this.formRegistroEvento.value.location,
      image: this.formRegistroEvento.value.image,
      price: this.formRegistroEvento.value.price,
      organizer: this.formRegistroEvento.value.organizer,
      capacity: this.formRegistroEvento.value.capacity,
      categoria_name: selectedCategory.name, // Asignamos el nombre de la categoría
      categoryId: this.formRegistroEvento.value.category,
    };

    console.log('Evento a crear:', objeto);

    this.EventService.crearEvento(objeto).subscribe({
      next: (resp) => {
        this.mostrarFeedback('Evento creado con éxito!', true);
        setTimeout(() => {
          this.router.navigate(['/profile']);
        }, 1000);
      },
      error: (err) => {
        console.error('Error creando el evento:', err);
        this.mostrarFeedback('Error al actualizar el perfil', false);
      }
    });
  }

  private mostrarFeedback(mensaje: string, esExito: boolean) {
    this.feedbackMessage = mensaje;
    this.feedbackSuccess = esExito;
  }

}
