import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { Router, RouterLink } from '@angular/router';
import { UsuarioEdit } from '../../interfaces/UsuarioEdit';
import { ImageUploadService } from '../../services/image-upload.service';

import { HeaderComponent } from '../../components/header/header.component';
import { normalizeOptionalText, PHONE_PATTERN } from '../../utils/validation';

@Component({
    selector: 'app-prefil-edit',
    imports: [ReactiveFormsModule, HeaderComponent, RouterLink], // <--- Lo agregamos aquí
    templateUrl: './prefil-edit.component.html',
    styleUrl: './prefil-edit.component.css'
})
export class PrefilEditComponent implements OnInit, OnDestroy {
  private AccesService = inject(AuthService);
  private router = inject(Router);
  private toastService = inject(ToastService);
  private imageUploadService = inject(ImageUploadService);
  public formBuild = inject(FormBuilder);

  public formEditarPerfil: FormGroup = this.formBuild.group({
    imgPerfil: [''],
    firstname: ['', [Validators.required]],
    lastname: ['', [Validators.required]],
    phone: ['', [Validators.pattern(PHONE_PATTERN)]],
    pais: [''],
    provincia: [''],
    ciudad: [''],
    birth: [''],
    address: [''],
  });

  private userId: string | null = null;
  public isSaving: boolean = false;
  public selectedProfileImageFile: File | null = null;
  public profileImagePreview: string = '';
  private profileImagePreviewObjectUrl: string | null = null;
  private readonly allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  private readonly maxImageSize = 8 * 1024 * 1024;

  ngOnInit(): void {
    this.cargarDatosUsuario();
  }

  ngOnDestroy(): void {
    this.revokeProfileImagePreview();
  }

  cargarDatosUsuario(): void {
    this.AccesService.ensureCurrentUser().subscribe({
      next: (data) => {
        if (!data) {
          this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
          return;
        }

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
        this.profileImagePreview = data.imgPerfil || '';
      },
      error: () => {
        this.toastService.error('Error al cargar los datos del usuario');
      }
    });
  }

  actualizarPerfil() {
    if (this.isSaving) return;

    if (this.formEditarPerfil.invalid) {
      this.formEditarPerfil.markAllAsTouched();
      this.toastService.warning('Revisá los campos marcados antes de guardar.');
      return;
    }

    if (this.userId) {
      this.isSaving = true;

      if (this.selectedProfileImageFile) {
        this.imageUploadService.uploadImage(this.selectedProfileImageFile, 'profile').subscribe({
          next: ({ url }) => this.saveProfile(url),
          error: () => {
            this.toastService.error('No se pudo subir la imagen');
            this.isSaving = false;
          }
        });
        return;
      }

      this.saveProfile(this.formEditarPerfil.value.imgPerfil);
    } else {
      this.toastService.error('Error: ID de usuario no disponible');
    }
  }

  private saveProfile(imgPerfil: string) {
    if (this.userId) {
      this.formEditarPerfil.patchValue({ imgPerfil });
      const objeto: UsuarioEdit = {
        id: Number(this.userId),
        firstname: normalizeOptionalText(this.formEditarPerfil.value.firstname),
        lastname: normalizeOptionalText(this.formEditarPerfil.value.lastname),
        phone: normalizeOptionalText(this.formEditarPerfil.value.phone),
        pais: normalizeOptionalText(this.formEditarPerfil.value.pais),
        provincia: normalizeOptionalText(this.formEditarPerfil.value.provincia),
        ciudad: normalizeOptionalText(this.formEditarPerfil.value.ciudad),
        address: normalizeOptionalText(this.formEditarPerfil.value.address),
        birth: normalizeOptionalText(this.formEditarPerfil.value.birth),
        imgPerfil
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
          this.isSaving = false;
        }
      });
    }
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('cachedProfile');
    }
  }

  onProfileImageSelected(event: globalThis.Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (!this.allowedImageTypes.has(file.type)) {
      this.toastService.warning('Usá una imagen JPG, PNG, WebP o GIF');
      input.value = '';
      return;
    }

    if (file.size > this.maxImageSize) {
      this.toastService.warning('La imagen no puede superar 8MB');
      input.value = '';
      return;
    }

    this.selectedProfileImageFile = file;
    this.revokeProfileImagePreview();
    this.profileImagePreviewObjectUrl = URL.createObjectURL(file);
    this.profileImagePreview = this.profileImagePreviewObjectUrl;
  }

  clearSelectedProfileImage(): void {
    this.selectedProfileImageFile = null;
    this.revokeProfileImagePreview();
    this.profileImagePreview = this.formEditarPerfil.get('imgPerfil')?.value || '';
  }

  getProfileImagePreview(): string {
    return this.profileImagePreview || this.formEditarPerfil.get('imgPerfil')?.value || 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png';
  }

  private revokeProfileImagePreview(): void {
    if (this.profileImagePreviewObjectUrl) {
      URL.revokeObjectURL(this.profileImagePreviewObjectUrl);
      this.profileImagePreviewObjectUrl = null;
    }
  }
}
