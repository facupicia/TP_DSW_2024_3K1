import {Component, DestroyRef, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute, RouterLink} from '@angular/router';
import {HttpClient} from '@angular/common/http';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {environment} from '../../../environments/environment';

@Component({
    selector:'app-reset-password',
    imports:[FormsModule,RouterLink],
    template:`<main class="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <section class="bg-white rounded-2xl shadow p-8 w-full max-w-md" aria-labelledby="reset-title">
        <h1 id="reset-title" class="text-2xl font-bold mb-4">{{token ? 'Elegí una nueva contraseña' : 'Recuperá tu cuenta'}}</h1>
        <p class="text-slate-600 mb-6">{{token ? 'Usá al menos 8 caracteres.' : 'Te enviaremos un enlace para cambiar tu contraseña.'}}</p>
        @if (!completed) {
          <form (ngSubmit)="submit()" #form="ngForm">
            @if (token) {
              <label for="new-password" class="block mb-2">Nueva contraseña</label>
              <input id="new-password" name="password" [(ngModel)]="password" type="password" autocomplete="new-password" required minlength="8" maxlength="72" class="border rounded-lg p-3 w-full mb-4">
              <label for="confirm-password" class="block mb-2">Repetí la contraseña</label>
              <input id="confirm-password" name="confirmation" [(ngModel)]="confirmation" type="password" autocomplete="new-password" required class="border rounded-lg p-3 w-full mb-4">
            } @else {
              <label for="reset-email" class="block mb-2">Correo electrónico</label>
              <input id="reset-email" name="email" [(ngModel)]="email" type="email" autocomplete="email" required email class="border rounded-lg p-3 w-full mb-4">
            }
            <button type="submit" [disabled]="busy || form.invalid" class="bg-blue-700 text-white rounded-lg p-3 w-full disabled:opacity-50">{{busy ? 'Procesando…' : token ? 'Guardar contraseña' : 'Enviar enlace'}}</button>
          </form>
        }
        <p role="status" class="mt-4 text-slate-700">{{message}}</p>
        <a routerLink="/login" class="inline-block text-blue-700 underline mt-6">Volver a iniciar sesión</a>
      </section>
    </main>`
})
export class ResetPasswordComponent {
    private http=inject(HttpClient);
    private destroyRef=inject(DestroyRef);
    token=inject(ActivatedRoute).snapshot.queryParamMap.get('token') || '';
    email='';password='';confirmation='';message='';busy=false;completed=false;
    submit() {
        if(this.busy) return;
        if(this.token && this.password!==this.confirmation) {this.message='Las contraseñas deben coincidir.';return;}
        this.busy=true;this.message='';
        this.http.post<{message:string}>(environment.apiUrl+'/user/password/'+(this.token?'complete':'request'),this.token?{token:this.token,password:this.password}:{email:this.email})
            .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({next:r=>{this.busy=false;this.completed=true;this.message=r.message;this.password='';this.confirmation='';},error:e=>{this.busy=false;this.message=e.error?.message || 'No pudimos procesar la solicitud. Intentá nuevamente.';}});
    }
}
