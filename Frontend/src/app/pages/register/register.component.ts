import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { Router, RouterLink } from '@angular/router';
import { Usuario } from '../../interfaces/Usuario';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Subject, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
})
export class RegisterComponent {
  errorMessages: string[] = [];
  private AccesService = inject(AuthService);
  private router = inject(Router);
  private toastService = inject(ToastService);
  private http = inject(HttpClient);
  public formBuild = inject(FormBuilder);

  public isLoading: boolean = false;

  // Nominatim search
  public locationSuggestions: any[] = [];
  public showSuggestions: boolean = false;
  private locationSearch$ = new Subject<string>();

  public formRegistro: FormGroup = this.formBuild.group({
    email: ['', [Validators.required, Validators.email]],
    firstname: ['', Validators.required],
    lastname: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(6)]],
    phone: ['', [Validators.required]],
    pais: [''],
    provincia: [''],
    ciudad: ['', Validators.required],
    birth: ['', Validators.required],
    address: ['', Validators.required],
  });

  constructor() {
    this.setupLocationSearch();
  }

  setupLocationSearch() {
    this.locationSearch$.pipe(
      debounceTime(800),
      distinctUntilChanged(),
      switchMap(query => {
        if (query && query.length > 2 && this.showSuggestions) {
          return this.http.get<any[]>(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=5&addressdetails=1`);
        }
        return of([]);
      }),
      catchError(() => of([]))
    ).subscribe(results => {
      this.locationSuggestions = results;
    });
  }

  onInputLocation(event: Event) {
    this.showSuggestions = true;
    const input = event.target as HTMLInputElement;
    this.locationSearch$.next(input.value);
  }

  closeSuggestions() {
    setTimeout(() => { this.showSuggestions = false; }, 200);
  }

  selectAddress(item: any) {
    this.showSuggestions = false;
    const addr = item.address || {};
    this.formRegistro.patchValue({
      pais: addr.country || '',
      provincia: addr.state || addr.region || '',
      ciudad: addr.city || addr.town || addr.village || addr.municipality || ''
    });
  }

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

    this.AccesService.registrarse(objeto).subscribe({
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
  }
}