import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { EventService } from '../../services/event.service';
import { Evento } from '../../interfaces/event.js';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../../components/header/header.component';
import { CategoryService } from '../../services/category.service';
import { Categoria } from '../../interfaces/categoria';

@Component({
  selector: 'app-editar-evento',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, HeaderComponent],
  templateUrl: './editar-evento.component.html',
  styleUrl: './editar-evento.component.css'
})


export class EditarEventoComponent {
  private categoryService = inject(CategoryService);
  private EventService = inject(EventService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  public formBuild = inject(FormBuilder);
  feedbackMessage: string = '';
  feedbackSuccess: boolean = false;
  public categories: Categoria[] = [];

  private mostrarFeedback(mensaje: string, esExito: boolean) {
    this.feedbackMessage = mensaje;
    this.feedbackSuccess = esExito;
  }

  public formEditarEvento: FormGroup = this.formBuild.group({
    title: [''],
    description: [''],
    date: [''],
    time: [''],
    location: [''],
    image: [''],
    price: [''],
    organizer: [''],
    capacity: [''],
    category: [''],
  });

  private eventId: string | null = null;

  ngOnInit(): void {
    this.eventId = this.route.snapshot.paramMap.get('id');
    if (this.eventId) {
      this.cargarDatosEvento();
    }

    this.categoryService.getCategories().subscribe(
      (data) => {
        this.categories = data;
      },
      (error) => {
        console.error('Error al obtener las categorías:', error);
      }
    );
  }

  cargarDatosEvento() {
    this.EventService.obtenerEvento(Number(this.eventId)).subscribe({
      next: (evento: Evento) => {
        this.formEditarEvento.patchValue({
          title: evento.title,
          description: evento.description,
          date: evento.date,
          time: evento.time,
          location: evento.location,
          image: evento.image,
          price: evento.price,
          organizer: evento.organizer,
          capacity: evento.capacity
        });
      },
      error: (err: any) => {
        console.error('Error al cargar los datos del evento:', err);
      }
    });
  }
  updateEvent() {

    // Obtiene el id de la categoría desde el formulario
    const selectedCategoryId = parseInt(this.formEditarEvento.value.category, 10);

    // Busca la categoría correspondiente en la lista de categorías
    const selectedCategory = this.categories.find(cat => cat.id === selectedCategoryId);

    if (!selectedCategory) {
      console.error('Categoría seleccionada no encontrada.');
      return;
    }

    const objeto: Evento = {
      destacado: this.formEditarEvento.value.destacado,
      user_id: this.formEditarEvento.value.user_id,
      title: this.formEditarEvento.value.title,
      description: this.formEditarEvento.value.description,
      date: this.formEditarEvento.value.date,
      time: this.formEditarEvento.value.time,
      location: this.formEditarEvento.value.location,
      image: this.formEditarEvento.value.image,
      price: this.formEditarEvento.value.price,
      organizer: this.formEditarEvento.value.organizer,
      capacity: this.formEditarEvento.value.capacity,
      categoria_name: selectedCategory.name, // Asignamos el nombre de la categoría
      categoryId: this.formEditarEvento.value.category,
    };

    console.log(objeto);

    if (this.eventId !== null) {
      this.EventService.actualizarEvento(Number(this.eventId), objeto).subscribe({
        next: (resp) => {
          this.mostrarFeedback('Evento actualizado con éxito', true);
          setTimeout(() => {
            this.router.navigate(['/my-events']);
          }, 900);
        },
        error: (err) => {
          this.mostrarFeedback('Error al actualizar el evento', false);
          console.error('Error creating event:', err);
        }
      });
    }
  }
}
