import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { errorInterceptor } from './error.interceptor';
import { authInterceptor } from './auth.interceptor';
import { LOCAL_ERROR_FEEDBACK } from './error-context';
import { ToastService } from '../services/toast.service';
import { AuthService } from '../services/auth.service';
import { clearAccessToken, setAccessToken } from '../services/access-token.store';
import { environment } from '../../environments/environment';

describe('HTTP feedback and public requests', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let toast: any;
  let logout: jasmine.Spy;
  beforeEach(() => {
    toast = jasmine.createSpyObj('ToastService', ['error']); logout = jasmine.createSpy('logout');
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
      provideHttpClient(withInterceptors([errorInterceptor, authInterceptor])), provideHttpClientTesting(),
      { provide: ToastService, useValue: toast }, { provide: AuthService, useValue: { logout } }
    ] });
    client = TestBed.inject(HttpClient); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); clearAccessToken(); });

  it('leaves login failures to the screen and preserves the existing session', () => {
    client.post(`${environment.apiUrl}/user/login`, {}, { context: new HttpContext().set(LOCAL_ERROR_FEEDBACK, true) })
      .subscribe({ error: () => toast.error('Credenciales incorrectas') });
    http.expectOne(r => r.url.endsWith('/login')).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(toast.error).toHaveBeenCalledOnceWith('Credenciales incorrectas'); expect(logout).not.toHaveBeenCalled();
  });

  it('reports an empty network error once without crashing', () => {
    client.get(`${environment.apiUrl}/category`).subscribe({ error: () => {} });
    http.expectOne(r => r.url.endsWith('/category')).error(new ProgressEvent('error'));
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('revokes an expired scanner session without duplicating its local feedback', () => {
    client.post(`${environment.apiUrl}/scanner/validate`, {}, { context: new HttpContext().set(LOCAL_ERROR_FEEDBACK, true) })
      .subscribe({ error: () => {} });
    http.expectOne(r => r.url.endsWith('/scanner/validate')).flush({}, { status: 401, statusText: 'Unauthorized' });
    http.expectOne(r => r.url.endsWith('/user/refresh')).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(logout).toHaveBeenCalledTimes(1); expect(toast.error).not.toHaveBeenCalled();
  });

  it('keeps public SSR data anonymous while authenticating private requests', () => {
    setAccessToken('test-token');
    client.get(`${environment.apiUrl}/event/1`).subscribe();
    const publicRequest = http.expectOne(r => r.url.endsWith('/event/1'));
    expect(publicRequest.request.withCredentials).toBeFalse();
    expect(publicRequest.request.headers.has('Authorization')).toBeFalse(); publicRequest.flush({});
    client.get(`${environment.apiUrl}/user/profile`).subscribe();
    const privateRequest = http.expectOne(r => r.url.endsWith('/user/profile'));
    expect(privateRequest.request.withCredentials).toBeTrue();
    expect(privateRequest.request.headers.get('Authorization')).toBe('Bearer test-token'); privateRequest.flush({});
  });
});
