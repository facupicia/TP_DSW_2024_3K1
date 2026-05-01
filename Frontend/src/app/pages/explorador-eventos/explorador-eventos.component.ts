import { Component, inject, OnInit, DestroyRef } from '@angular/core';
import { Router } from '@angular/router';
import { EventService } from '../../services/event.service';
import { Evento } from '../../interfaces/event';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { HeaderComponent } from '../../components/header/header.component';
import { CategoryService } from '../../services/category.service';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
    selector: 'app-explorador-eventos',
    imports: [CommonModule, HeaderComponent, FormsModule, NgOptimizedImage],
    templateUrl: './explorador-eventos.component.html',
    styleUrl: './explorador-eventos.component.css'
})
export class ExploradorEventosComponent implements OnInit {
  private router: Router = inject(Router);
  private eventoService: EventService = inject(EventService);
  private categoryService: CategoryService = inject(CategoryService);
  private destroyRef = inject(DestroyRef);

  eventos: Evento[] = [];
  categorias: string[] = [];
  eventosFiltrados: Evento[] = [];

  // VARIABLES DE PAGINACIÓN
  currentPage: number = 1;
  itemsPerPage: number = 8; // Muestra 8 eventos por página (2 filas de 4)

  // Filtros
  categoriaSeleccionada: string = ''; // Vacío significa 'Todas'
  searchTerm: string = '';

  isLoading: boolean = true;
  destacados: Evento[] = [];

  ngOnInit(): void {
    this.isLoading = true;

    // Cargar Eventos y Destacados en una sola llamada
    this.eventoService.obtenerEventos().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (eventos) => {
        this.eventos = eventos;
        this.eventosFiltrados = eventos;
        this.destacados = eventos.filter(e => e.destacado);
        this.isLoading = false;
      },
      error: () => {
        // Error handled by interceptor
        this.isLoading = false;
      }
    });

    // Cargar Categorías
    this.obtenerCategorias();
  }

  obtenerCategorias() {
    this.categoryService.getCategories().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((categorias) => {
      this.categorias = categorias.map(categoria => categoria.name);
    })
  }

  // Método actualizado para seleccionar categoría mediante Click (Chips)
  seleccionarCategoria(categoria: string) {
    if (this.categoriaSeleccionada === categoria) {
      this.categoriaSeleccionada = ''; // Deseleccionar si ya estaba activa
    } else {
      this.categoriaSeleccionada = categoria;
    }
    this.filtrarEventos();
  }

  filtrarEventos() {
    this.eventosFiltrados = this.eventos.filter(evento => {
      const matchesCategory = this.categoriaSeleccionada ? evento.categoria_name === this.categoriaSeleccionada : true;
      const matchesSearch = this.searchTerm ? evento.title.toLowerCase().includes(this.searchTerm.toLowerCase()) : true;
      return matchesCategory && matchesSearch;
    });

    // IMPORTANTE: Resetear a página 1 cuando se filtra
    this.currentPage = 1;
  }

  verEvento(id: number): void {
    this.router.navigate([`event/${id}`]);
  }

  tieneEventosDestacados(): boolean {
    return this.destacados.length > 0;
  }

  get eventosPaginados(): Evento[] {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    // Cortamos el array de filtrados para mostrar solo la página actual
    return this.eventosFiltrados.slice(startIndex, endIndex);
  }

  // 2. Calcular total de páginas
  get totalPages(): number {
    return Math.ceil(this.eventosFiltrados.length / this.itemsPerPage);
  }

  // 3. Generar array de números de página para el HTML [1, 2, 3...]
  get pageNumbers(): number[] {
    return Array(this.totalPages).fill(0).map((x, i) => i + 1);
  }

  // 4. Cambiar de página
  changePage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      // Scroll suave hacia el inicio de la lista de eventos (para UX)
      document.getElementById('grid-eventos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }


}
