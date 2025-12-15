import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CategoryService } from '../../services/category.service';
import { CommonModule } from '@angular/common';
import { Categoria } from '../../interfaces/categoria';
import { AuthService } from '../../services/auth.service';
import { Usuario } from '../../interfaces/Usuario';
import { HeaderComponent } from '../../components/header/header.component'; // Opcional si usas el sidebar interno

type TabView = 'dashboard' | 'users' | 'categories';

@Component({
  selector: 'app-category', // Podrías renombrarlo a app-admin-dashboard
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule], // HeaderComponent quitado si usas layout propio
  templateUrl: './category.component.html',
  styleUrls: ['./category.component.css']
})
export class CategoryComponent implements OnInit {

  private userService = inject(AuthService);
  private categoryService = inject(CategoryService);
  public formBuild = inject(FormBuilder);

  public activeTab: TabView = 'dashboard';

  public formCategory: FormGroup = this.formBuild.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
  });

  categorias: Categoria[] = [];
  usuarios: Usuario[] = [];

  // Estadísticas Simples
  stats = {
    totalUsers: 0,
    totalCategories: 0,
    activeEvents: 12 // Dato fake por ahora
  };

  ngOnInit(): void {
    this.cargarDatos();
  }

  cargarDatos() {
    // 1. Cargar Categorías
    this.categoryService.getCategories().subscribe(res => {
      this.categorias = res;
      this.stats.totalCategories = res.length;
    });

    // 2. Cargar Usuarios
    const token = localStorage.getItem('token');
    if (token) {
      this.userService.getUsers().subscribe(res => {
        this.usuarios = res;
        this.stats.totalUsers = res.length;
      });
    }
  }

  cambiarTab(tab: TabView) {
    this.activeTab = tab;
  }

  crearCategoria() {
    if (this.formCategory.invalid) return;
    
    // CORRECCIÓN 1: Obtenemos el valor directo (string), no creamos un objeto
    const nombreCategoria = this.formCategory.value.name;
    
    // Le pasamos el string directo al servicio
    this.categoryService.cargarCategoria(nombreCategoria).subscribe({
      // CORRECCIÓN 2: Le decimos a TS que 'res' es de tipo 'any' o 'Categoria' para poder pushearlo
      next: (res: any) => { 
        
        // Al ser 'any', ahora sí nos deja agregarlo al array de Categoria[]
        this.categorias.push(res); 
        
        this.stats.totalCategories++;
        this.formCategory.reset();
      },
      error: (err) => console.error(err)
    });
  }

  eliminarCategoria(id: number) {
    if (confirm('¿Eliminar categoría?')) {
      this.categoryService.deleteCategory(id).subscribe(() => {
        this.categorias = this.categorias.filter(c => c.id !== id);
        this.stats.totalCategories--;
      });
    }
  }

  eliminarUsuario(id: any) {
    if (confirm('¿Eliminar usuario? Esta acción es irreversible.')) {
      this.userService.delete(id).subscribe(() => {
        this.usuarios = this.usuarios.filter(u => u.id !== id);
        this.stats.totalUsers--;
      });
    }
  }
}
