import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService, AccountClaimInfo } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-claim-account',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './claim-account.component.html',
  styleUrl: './claim-account.component.css'
})
export class ClaimAccountComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private fb = inject(FormBuilder);

  token = '';
  loading = true;
  submitting = false;
  requesting = false;
  requestSent = false;
  invalid = false;
  claimInfo: AccountClaimInfo | null = null;
  showPassword = false;

  requestForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]]
  });

  form = this.fb.group({
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required]]
  });

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') || '';

    if (!this.token) {
      this.loading = false;
      return;
    }

    this.authService.validateAccountClaim(this.token).subscribe({
      next: (info) => {
        this.claimInfo = info;
        this.invalid = !info.valid;
        this.loading = false;
      },
      error: () => {
        this.invalid = true;
        this.loading = false;
      }
    });
  }

  completeClaim(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const password = this.form.value.password || '';
    const confirmPassword = this.form.value.confirmPassword || '';

    if (password !== confirmPassword) {
      this.toastService.warning('Las contraseñas no coinciden.');
      return;
    }

    this.submitting = true;
    this.authService.completeAccountClaim(this.token, password).subscribe({
      next: () => {
        this.toastService.success('Cuenta reclamada. Ya puedes ver tus tickets.');
        const userId = this.authService.currentUserValue?.id;
        this.router.navigate([userId ? `/my-tickets/${userId}` : '/profile']);
      },
      error: () => {
        this.submitting = false;
      }
    });
  }

  requestLink(): void {
    if (this.requestForm.invalid) {
      this.requestForm.markAllAsTouched();
      return;
    }

    this.requesting = true;
    this.authService.requestAccountClaim(this.requestForm.value.email || '').subscribe({
      next: () => {
        this.requesting = false;
        this.requestSent = true;
        this.toastService.info('Si ese correo tiene una compra invitada, enviaremos el enlace.');
      },
      error: () => {
        this.requesting = false;
      }
    });
  }
}
