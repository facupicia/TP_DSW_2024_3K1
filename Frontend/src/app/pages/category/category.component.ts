import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CategoryServiceService } from '../../services/category.service.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Categoria } from '../../interfaces/categoria';
import { HeaderComponent } from '../header/header.component';
import { AccesService } from '../../services/acces.service';
import { Usuario } from '../../interfaces/Usuario';

@Component({
  selector: 'app-category',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, HeaderComponent],
  templateUrl: './category.component.html',
  styleUrl: './category.component.css'
})


export class CategoryComponent {

  // Injecting services
  private UserService = inject(AccesService)
  private CategoryService = inject(CategoryServiceService);
  private router = inject(Router);
  public formBuild = inject(FormBuilder);

  // Defining the form group
  public formCategory: FormGroup = this.formBuild.group({
    name: ['', [Validators.required]],
  });
  errorMessages: any;

  categorias: Categoria[] = [];
  usuarios: Usuario[] = []
  userId: any
  mostrarTabla: boolean = false;
  mostrarCategory: boolean = false;


  ngOnInit(): void {
    this.CategoryService.getCategories().subscribe((categorias) => {
      console.log(categorias); // Verifica que los datos se reciban correctamente
      this.categorias = categorias;
    });

    const token = localStorage.getItem('token');
    if (!token) {
      console.error('Token no encontrado en localStorage.');
      return;
    }
    this.UserService.getUsers().subscribe({
      next: (usuarios: Usuario[]) => {
        console.log('Usuarios:', usuarios);
        this.usuarios = usuarios;
      },
      error: (error: any) => {
        console.error('Error al obtener usuarios:', error);
      }
    });
  }


  eliminarCategoria(id: number): void {
    this.CategoryService.deleteCategory(id).subscribe(
      (response) => {
        console.log('Categoría eliminada:', response);
        this.categorias = this.categorias.filter(categoria => categoria.id !== id);
      },
      (error) => {
        console.error('Error al eliminar categoría:', error);
      }
    );
  }

  borrarUsuario(userId: any): void {
    this.UserService.delete(userId).subscribe({
      next: () => {
        console.log('Usuario eliminado');
        this.usuarios = this.usuarios.filter(usuario => usuario.id !== userId);
      },
      error: (error: any) => {
        console.error('Error al eliminar usuario:', error);
      }
    });
  }

  CargarCategoria() {
    if (this.formCategory.invalid) return;

    const objeto: any = {
      name: this.formCategory.value.name
    };
    console.log(objeto);

    this.CategoryService.cargarCategoria(objeto!).subscribe({
      next: (response) => {
        console.log('Categoria registrada:', response);
        this.ngOnInit()
      },
      error: (error) => {
        this.errorMessages = error;
      }
    });
  }



}
