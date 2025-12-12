import { TestBed } from '@angular/core/testing';
import { LoginComponent } from './login.component';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ReactiveFormsModule } from '@angular/forms';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let accesServiceSpy: jasmine.SpyObj<AuthService>;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    const accesServiceMock = jasmine.createSpyObj('AuthService', ['login']);
    const routerMock = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [ReactiveFormsModule],
      declarations: [LoginComponent],
      providers: [
        { provide: AuthService, useValue: accesServiceMock },
        { provide: Router, useValue: routerMock },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    accesServiceSpy = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
    routerSpy = TestBed.inject(Router) as jasmine.SpyObj<Router>;
  });

  it('Debe crear el componente', () => {
    expect(component).toBeTruthy();
  });

  describe('Formulario inicializado correctamente', () => {
    it('Debe inicializar el formulario con controles email y password', () => {
      expect(component.formLogin.contains('email')).toBeTrue();
      expect(component.formLogin.contains('password')).toBeTrue();
    });

    it('Los controles deben iniciar vacíos y con validaciones', () => {
      const emailControl = component.formLogin.get('email');
      const passwordControl = component.formLogin.get('password');

      expect(emailControl?.value).toBe('');
      expect(emailControl?.hasError('required')).toBeTrue();

      expect(passwordControl?.value).toBe('');
      expect(passwordControl?.hasError('required')).toBeTrue();
    });
  });

  describe('Validaciones del formulario', () => {
    it('Debe ser inválido si faltan datos', () => {
      component.formLogin.setValue({ email: '', password: '' });
      expect(component.formLogin.invalid).toBeTrue();
    });

    it('Debe ser válido con datos correctos', () => {
      component.formLogin.setValue({ email: 'test@example.com', password: '123456' });
      expect(component.formLogin.valid).toBeTrue();
    });
  });

  describe('iniciarSesion()', () => {
    it('No debe llamar al servicio si el formulario es inválido', () => {
      component.formLogin.setValue({ email: '', password: '' });

      component.iniciarSesion();

      expect(accesServiceSpy.login).not.toHaveBeenCalled();
    });

    it('Debe llamar al servicio con los datos correctos si el formulario es válido', () => {
      const loginResponse = { token: 'fake-token' };
      accesServiceSpy.login.and.returnValue(of(loginResponse));

      component.formLogin.setValue({ email: 'test@example.com', password: '123456' });
      component.iniciarSesion();

      expect(accesServiceSpy.login).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: '123456',
      });
    });

    it('Debe navegar al home tras login exitoso', (done) => {
      const loginResponse = { token: 'fake-token' };
      accesServiceSpy.login.and.returnValue(of(loginResponse));

      component.formLogin.setValue({ email: 'test@example.com', password: '123456' });

      component.iniciarSesion();

      setTimeout(() => {
        expect(routerSpy.navigate).toHaveBeenCalledWith(['/']);
        done();
      }, 900);
    });

    it('Debe manejar errores correctamente', () => {
      accesServiceSpy.login.and.returnValue(throwError(() => new Error('Login failed')));

      component.formLogin.setValue({ email: 'test@example.com', password: '123456' });
      component.iniciarSesion();

      expect(component.feedbackMessage).toBe('Error al iniciar sesión');
      expect(component.feedbackSuccess).toBeFalse();
    });
  });

  describe('mostrarFeedback()', () => {
    it('Debe actualizar el mensaje y el estado de éxito', () => {
      component.mostrarFeedback('Prueba exitosa', true);
      expect(component.feedbackMessage).toBe('Prueba exitosa');
      expect(component.feedbackSuccess).toBeTrue();

      component.mostrarFeedback('Prueba fallida', false);
      expect(component.feedbackMessage).toBe('Prueba fallida');
      expect(component.feedbackSuccess).toBeFalse();
    });
  });
});
