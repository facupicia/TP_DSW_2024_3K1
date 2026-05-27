import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { Router, RouterLink } from '@angular/router';
import { Usuario } from '../../interfaces/Usuario';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../../components/header/header.component';
import { PASSWORD_MIN_LENGTH, PHONE_PATTERN } from '../../utils/validation';

@Component({
    selector: 'app-register',
    imports: [ReactiveFormsModule, CommonModule, RouterLink, HeaderComponent],
    templateUrl: './register.component.html',
    styleUrls: ['./register.component.css']
})
export class RegisterComponent {
  errorMessages: string[] = [];
  private AccesService = inject(AuthService);
  private router = inject(Router);
  private toastService = inject(ToastService);
  public formBuild = inject(FormBuilder);
  private destroyRef = inject(DestroyRef);

  public isLoading: boolean = false;
  public showPassword: boolean = false; // Toggle para mostrar/ocultar contraseña

  public formRegistro: FormGroup = this.formBuild.group({
    email: ['', [Validators.required, Validators.email]],
    firstname: ['', Validators.required],
    lastname: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH)]],
    phone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
    pais: [''],
    provincia: [''],
    ciudad: ['', Validators.required],
    birth: ['', Validators.required],
    address: ['', Validators.required],
  });

  registrarse() {
    if (this.formRegistro.invalid) {
      this.formRegistro.markAllAsTouched();
      return;
    }

    this.isLoading = true; // Activar spinner

    const objeto: Usuario = {
      email: this.formRegistro.value.email,
      firstname: this.formRegistro.value.firstname,
      lastname: this.formRegistro.value.lastname,
      password: this.formRegistro.value.password,
      phone: this.formRegistro.value.phone.toString(),
      pais: this.formRegistro.value.pais,
      provincia: this.formRegistro.value.provincia,
      ciudad: this.formRegistro.value.ciudad,
      birth: this.formRegistro.value.birth,
      address: this.formRegistro.value.address
    };

    this.AccesService.registrarse(objeto).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        this.toastService.success('¡Cuenta creada con éxito!');
        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 1500);
      },
      error: (error) => {
        this.isLoading = false; // Desactivar spinner si falla
        this.toastService.error('Error al crear el perfil');
        this.errorMessages = error;
      }
    });
  }

  formatPhoneNumber(event: any) {
    let input = event.target.value.replace(/\D/g, '');
    if (input.length > 4) {
      input = `${input.substring(0, 4)}-${input.substring(4, 10)}`;
    }
    event.target.value = input;
    this.formRegistro.get('phone')?.setValue(input, { emitEvent: false });
  }
}
