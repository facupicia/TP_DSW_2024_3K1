import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router'; // Agregamos RouterLink
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Login } from '../../interfaces/Login';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, RouterLink], // Importante: RouterLink
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent {

  private accesService = inject(AuthService);
  private router = inject(Router);
  private formBuilder = inject(FormBuilder);
  private toastService = inject(ToastService);

  public isLoading: boolean = false; // Estado para el spinner

  public formLogin: FormGroup = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  public iniciarSesion(): void {
    if (this.formLogin.valid) {
      this.isLoading = true; // Activar carga

      const loginData: Login = {
        email: this.formLogin.value.email,
        password: this.formLogin.value.password,
      };

      this.accesService.login(loginData).subscribe({
        next: (response) => {
          this.toastService.success('¡Bienvenido de nuevo!'); // Mensaje más amigable
          localStorage.setItem('token', response.token);
          setTimeout(() => {
            this.router.navigate(['/']);
          }, 1000); // Un pequeño delay para que se vea la animación
        },
        error: () => {
          this.isLoading = false; // Desactivar carga si falla
          this.toastService.error('Credenciales incorrectas');
        },
      });
    } else {
      this.formLogin.markAllAsTouched();
    }
  }
}