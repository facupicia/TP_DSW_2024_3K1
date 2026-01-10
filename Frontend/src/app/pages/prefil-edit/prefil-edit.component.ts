import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { Router, RouterLink } from '@angular/router';
import { UsuarioEdit } from '../../interfaces/UsuarioEdit';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../../components/header/header.component';
import { HttpClient } from '@angular/common/http';
import { Subject, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';

@Component({
  selector: 'app-prefil-edit',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, HeaderComponent, RouterLink], // <--- Lo agregamos aquí
  templateUrl: './prefil-edit.component.html',
  styleUrl: './prefil-edit.component.css'
})
export class PrefilEditComponent implements OnInit {
  private AccesService = inject(AuthService);
  private router = inject(Router);
  private toastService = inject(ToastService);
  private http = inject(HttpClient);
  public formBuild = inject(FormBuilder);

  // Nominatim search
  public locationSuggestions: any[] = [];
  public showSuggestions: boolean = false;
  private locationSearch$ = new Subject<string>();

  public formEditarPerfil: FormGroup = this.formBuild.group({
    imgPerfil: [''],
    firstname: [''],
    lastname: [''],
    phone: ['', [Validators.pattern('[0-9]+')]],
    pais: [''],
    provincia: [''],
    ciudad: [''],
    birth: [''],
    address: [''],
  });

  private userId: string | null = null;

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
    this.formEditarPerfil.patchValue({
      pais: addr.country || '',
      provincia: addr.state || addr.region || '',
      ciudad: addr.city || addr.town || addr.village || addr.municipality || ''
    });
  }

  ngOnInit(): void {
    this.cargarDatosUsuario();
  }

  cargarDatosUsuario(): void {
    const token = localStorage.getItem('token');
    if (token) {
      this.AccesService.getProfile().subscribe({
        next: (data) => {
          this.userId = data.id;
          this.formEditarPerfil.patchValue({
            imgPerfil: data.imgPerfil,
            firstname: data.firstname,
            lastname: data.lastname,
            phone: data.phone,
            pais: data.pais || '',
            provincia: data.provincia || '',
            ciudad: data.ciudad || '',
            address: data.address || '',
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
    if (this.userId) {
      const objeto: UsuarioEdit = {
        id: Number(this.userId),
        firstname: this.formEditarPerfil.value.firstname,
        lastname: this.formEditarPerfil.value.lastname,
        phone: this.formEditarPerfil.value.phone.toString(),
        pais: this.formEditarPerfil.value.pais,
        provincia: this.formEditarPerfil.value.provincia,
        ciudad: this.formEditarPerfil.value.ciudad,
        address: this.formEditarPerfil.value.address,
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
        }
      });
    } else {
      this.toastService.error('Error: ID de usuario no disponible');
    }
    localStorage.removeItem('cachedProfile');
  }
}