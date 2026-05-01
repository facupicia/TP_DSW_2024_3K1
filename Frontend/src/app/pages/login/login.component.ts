import { Component, inject, PLATFORM_ID, NgZone, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Login } from '../../interfaces/Login';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { environment } from '../../../environments/environment';
import { HeaderComponent } from '../../components/header/header.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, RouterLink, HeaderComponent], // Importante: RouterLink
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent implements OnInit, OnDestroy {
  declare google: any;

  private accesService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private formBuilder = inject(FormBuilder);
  private toastService = inject(ToastService);
  private platformId = inject(PLATFORM_ID);
  private ngZone = inject(NgZone);

  public isLoading: boolean = false;
  public showPassword: boolean = false;
  private googleCheckInterval?: number;
  private googleCheckTimeout?: number;
  
  public formLogin: FormGroup = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  // Detectar Safari en iOS para usar modo redirect
  private get isSafariIOS(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    const ua = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isSafari = /safari/.test(ua) && !/chrome|crios|crmo/.test(ua);
    return isIOS && isSafari;
  }

  ngOnInit() {
    // Manejar callback de Google OAuth después de redirect (para Safari iOS)
    if (isPlatformBrowser(this.platformId)) {
      this.handleGoogleRedirectCallback();
    }
  }

  ngAfterViewInit() {
    this.initGoogle();
  }

  ngOnDestroy(): void {
    if (this.googleCheckInterval) {
      window.clearInterval(this.googleCheckInterval);
    }
    if (this.googleCheckTimeout) {
      window.clearTimeout(this.googleCheckTimeout);
    }
  }

  /**
   * Detecta si hay un credential de Google en la URL (modo redirect)
   * Google redirige de vuelta con el credential en el hash fragment
   */
  private handleGoogleRedirectCallback(): void {
    // Verificar si estamos regresando de un flujo de autenticación Google
    const authInProgress = sessionStorage.getItem('google_auth_in_progress');
    
    // Para modo redirect, Google puede poner el credential en diferentes lugares
    // Intentar obtener de múltiples fuentes
    let credential: string | null = null;
    
    // 1. Verificar en el hash de la URL (formato: #credential=xxx)
    const hash = window.location.hash;
    if (hash && hash.includes('credential=')) {
      const params = new URLSearchParams(hash.substring(1));
      credential = params.get('credential');
    }
    
    // 2. Verificar en query params (algunas configuraciones de Google)
    const urlParams = new URLSearchParams(window.location.search);
    if (!credential) {
      credential = urlParams.get('credential');
    }
    
    // 3. Verificar si hay un error en la URL
    const error = urlParams.get('error');
    if (error) {
      this.toastService.error('Error al iniciar sesión con Google');
      sessionStorage.removeItem('google_auth_in_progress');
      // Limpiar URL
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    
    // Si tenemos credential y veníamos de un flujo de auth
    if (credential && authInProgress) {
      sessionStorage.removeItem('google_auth_in_progress');
      // Limpiar URL
      window.history.replaceState({}, document.title, window.location.pathname);
      this.onGoogleCredential(credential);
    }
  }

  private initGoogle() {
    if (!isPlatformBrowser(this.platformId)) return;

    this.googleCheckInterval = window.setInterval(() => {
      const win = window as any;
      const g = win.google;
      if (g && environment.googleClientId) {
        window.clearInterval(this.googleCheckInterval);
        this.renderGoogleButton(g);
      }
    }, 100);

    // Timeout de seguridad para dejar de buscar
    this.googleCheckTimeout = window.setTimeout(() => {
      window.clearInterval(this.googleCheckInterval);
      if (!(window as any).google) {
        this.toastService.warning('No se pudo cargar Google Auth. Verifica tu conexión o intenta más tarde.');
      }
    }, 5000);
  }

  private renderGoogleButton(g: any) {
    try {
      // Para Safari iOS, intentamos usar FedCM primero, si no está disponible usamos redirect
      const useFedCM = this.isSafariIOS && this.isFedCMAvailable();
      const uxMode = this.isSafariIOS && !useFedCM ? 'redirect' : 'popup';

      g.accounts.id.initialize({
        client_id: environment.googleClientId,
        callback: (resp: any) => {
          this.ngZone.run(() => {
            // Limpiar flag de progreso si venía de redirect
            sessionStorage.removeItem('google_auth_in_progress');
            this.onGoogleCredential(resp?.credential);
          });
        },
        ux_mode: uxMode,
        auto_select: false,
        itp_support: true, // CRÍTICO: Soporte para Safari Intelligent Tracking Prevention
        // FedCM es la solución moderna para Safari's ITP
        use_fedcm_for_prompt: useFedCM
      });
      
      const btn = document.getElementById('googleBtn');
      if (btn) {
        // En Safari iOS con modo redirect, usar un botón personalizado es más confiable
        if (this.isSafariIOS && uxMode === 'redirect') {
          this.renderSafariFallbackButton(btn, g);
        } else {
          g.accounts.id.renderButton(btn, { 
            theme: 'outline', 
            size: 'large', 
            text: 'continue_with',
            width: '100%'
          });
        }
      }
    } catch (error) {
      this.toastService.error('No se pudo inicializar Google Auth');
    }
  }

  /**
   * Verifica si FedCM (Federated Credential Management) está disponible
   * FedCM es la API moderna que soluciona problemas de ITP en Safari
   */
  private isFedCMAvailable(): boolean {
    return 'IdentityCredential' in window || 
           (navigator as any).credentials?.fedcm?.login !== undefined;
  }

  /**
   * Renderiza un botón personalizado para Safari iOS que usa el flujo de redirect
   * de forma más confiable que el botón estándar de Google
   */
  private renderSafariFallbackButton(container: HTMLElement, g: any): void {
    container.replaceChildren();
    
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'safari-google-btn';
    const label = document.createElement('span');
    label.textContent = 'Continuar con Google';
    button.replaceChildren(this.createGoogleIcon(), label);
    
    // Estilos inline para el botón
    button.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      height: 44px;
      padding: 0 16px;
      background: white;
      border: 1px solid #dadce0;
      border-radius: 4px;
      color: #3c4043;
      font-family: 'Google Sans', Roboto, Arial, sans-serif;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.2s, box-shadow 0.2s;
    `;
    
    button.addEventListener('mouseenter', () => {
      button.style.backgroundColor = '#f8f9fa';
      button.style.boxShadow = '0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15)';
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.backgroundColor = 'white';
      button.style.boxShadow = 'none';
    });
    
    button.addEventListener('click', () => {
      // Marcar que estamos iniciando auth
      sessionStorage.setItem('google_auth_in_progress', 'true');
      // Usar prompt() en lugar de renderButton para Safari
      g.accounts.id.prompt((notification: any) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          // Si el prompt no se muestra, intentar con redirect manual
        }
      });
    });
    
    container.appendChild(button);
  }

  private createGoogleIcon(): SVGElement {
    const svgNamespace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNamespace, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');

    const paths = [
      ['#4285F4', 'M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z'],
      ['#34A853', 'M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'],
      ['#FBBC05', 'M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z'],
      ['#EA4335', 'M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z']
    ];

    paths.forEach(([fill, d]) => {
      const path = document.createElementNS(svgNamespace, 'path');
      path.setAttribute('fill', fill);
      path.setAttribute('d', d);
      svg.appendChild(path);
    });

    return svg;
  }

  private onGoogleCredential(credential: string) {
    if (!credential) return;
    this.isLoading = true;

    this.accesService.loginWithGoogle(credential).subscribe({
      next: (response) => {
        this.toastService.success('Inicio de sesión con Google exitoso');
        // Aseguramos que la navegación ocurra dentro de la zona de Angular
        this.ngZone.run(() => {
          setTimeout(() => {
            this.router.navigate(['/']);
          }, 500);
        });
      },
      error: (err) => {
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
