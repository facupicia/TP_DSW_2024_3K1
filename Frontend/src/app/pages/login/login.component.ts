import { Component, inject, PLATFORM_ID } from '@angular/core';
import { Router, RouterLink } from '@angular/router'; // Agregamos RouterLink
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Login } from '../../interfaces/Login';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, RouterLink], // Importante: RouterLink
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent {
  declare google: any;

  private accesService = inject(AuthService);
  private router = inject(Router);
  private formBuilder = inject(FormBuilder);
  private toastService = inject(ToastService);
  private platformId = inject(PLATFORM_ID);

  public isLoading: boolean = false; // Estado para el spinner

  public formLogin: FormGroup = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  ngAfterViewInit() {
    this.initGoogle();
  }

  private initGoogle() {
    if (!isPlatformBrowser(this.platformId)) return;
    const clientId = environment.googleClientId;
    const win = window as any;
    const g = win.google;
    if (!g || !clientId) return;
    g.accounts.id.initialize({
      client_id: clientId,
      callback: (resp: any) => this.onGoogleCredential(resp?.credential),
      ux_mode: 'popup',
      auto_select: false
    });
    const btn = document.getElementById('googleBtn');
    if (btn) {
      g.accounts.id.renderButton(btn, { theme: 'outline', size: 'large', text: 'continue_with' });
    }
  }

  private onGoogleCredential(credential: string) {
    if (!credential) return;
    this.isLoading = true;
    this.accesService.loginWithGoogle(credential).subscribe({
      next: (response) => {
        this.toastService.success('Inicio de sesión con Google exitoso');
        localStorage.setItem('token', response.token);
        setTimeout(() => {
          this.router.navigate(['/']);
        }, 500);
      },
      error: () => {
        this.isLoading = false;
        this.toastService.error('Error al iniciar sesión con Google');
      },
    });
  }

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
