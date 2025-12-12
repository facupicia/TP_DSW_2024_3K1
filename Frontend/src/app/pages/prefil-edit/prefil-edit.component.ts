import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { Router } from '@angular/router';
import { UsuarioEdit } from '../../interfaces/UsuarioEdit';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../../components/header/header.component';

@Component({
  selector: 'app-prefil-edit',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, HeaderComponent],
  templateUrl: './prefil-edit.component.html',
  styleUrl: './prefil-edit.component.css'
})
export class PrefilEditComponent implements OnInit {
  private AccesService = inject(AuthService);
  private router = inject(Router);
  private toastService = inject(ToastService);
  public formBuild = inject(FormBuilder);

  public formEditarPerfil: FormGroup = this.formBuild.group({
    imgPerfil: [''],
    firstname: [''],
    lastname: [''],
    phone: ['', [Validators.pattern('[0-9]+')]],
    location: [''],
    birth: [''],
  });

  private userId: string | null = null;

  ngOnInit(): void {
    this.cargarDatosUsuario();
  }

  cargarDatosUsuario(): void {
    const token = localStorage.getItem('token');
    if (token) {
      this.AccesService.getProfile().subscribe({
        next: (data) => {
          this.userId = data.id;  // Almacena el ID del usuario
          this.formEditarPerfil.patchValue({
            imgPerfil: data.imgPerfil,
            firstname: data.firstname,
            lastname: data.lastname,
            phone: data.phone,
            location: data.location,
            birth: data.birth,
          });
        },
        error: (error) => {
          this.toastService.error('Error al cargar los datos del usuario');
        }
      });
    }
  }

  actualizarPerfil() {
    if (this.userId) { // Asegurarse de que el userId esté disponible
      const objeto: UsuarioEdit = {
        id: Number(this.userId),
        firstname: this.formEditarPerfil.value.firstname,
        lastname: this.formEditarPerfil.value.lastname,
        phone: this.formEditarPerfil.value.phone.toString(),
        location: this.formEditarPerfil.value.location,
        birth: this.formEditarPerfil.value.birth,
        imgPerfil: this.formEditarPerfil.value.imgPerfil
      };

      this.AccesService.update(objeto).subscribe({
        next: (response) => {
          this.toastService.success('Perfil actualizado con éxito');
          setTimeout(() => {
            this.router.navigate(['/profile']);
          }, 1000);
        },
        error: (error) => {
          this.toastService.error('Error al actualizar el perfil');
          console.error('Error al actualizar el usuario:', error);
        }
      });
    } else {
      this.toastService.error('Error: ID de usuario no disponible');
    }
    localStorage.removeItem('cachedProfile');
  }



}

