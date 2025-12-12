import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Login } from '../../interfaces/Login';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent {

  private accesService = inject(AuthService);
  private router = inject(Router);
  private formBuilder = inject(FormBuilder);


  public formLogin: FormGroup = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });


  public feedbackMessage = '';
  public feedbackSuccess = false;


  public iniciarSesion(): void {
    if (this.formLogin.valid) {
      const loginData: Login = {
        email: this.formLogin.value.email,
        password: this.formLogin.value.password,
      };

      this.accesService.login(loginData).subscribe({
        next: (response) => {
          this.mostrarFeedback('Sesión iniciada con éxito!', true);
          localStorage.setItem('token', response.token);
          setTimeout(() => {
            this.router.navigate(['/']);
          }, 900);
        },
        error: () => {
          this.mostrarFeedback('Error al iniciar sesión', false);
        },
      });
    } else {
      this.formLogin.markAllAsTouched();
    }
  }


  public mostrarFeedback(message: string, isSuccess: boolean): void {
    this.feedbackMessage = message;
    this.feedbackSuccess = isSuccess;
  }
}
