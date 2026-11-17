import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { clearAccessToken, getAccessToken } from './access-token.store';
import { environment } from '../../environments/environment';

describe('AuthService role changes', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    clearAccessToken();
    window.localStorage.removeItem('eventlife_session');
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => { http.verify(); clearAccessToken(); window.localStorage.removeItem('eventlife_session'); });

  it('keeps the current session and profile when promoted to organizer', () => {
    service.getProfile().subscribe();
    http.expectOne(`${environment.apiUrl}/user/profile`).flush({ id: 1, firstname: 'Test', imgPerfil: 'avatar', roles: ['user'] });
    const logout = spyOn(service, 'logout');
    service.storeAccessToken('updated-token', ['user', 'organizer']);
    expect(getAccessToken()).toBe('updated-token');
    service.ensureCurrentUser().subscribe(user => {
      expect(user.roles).toEqual(['user', 'organizer']);
      expect(user.firstname).toBe('Test');
      expect(user.imgPerfil).toBe('avatar');
    });
    expect(logout).not.toHaveBeenCalled();
    http.expectNone(`${environment.apiUrl}/user/profile`);
  });

  it('does not log out on a forbidden profile response', () => {
    service.storeAccessToken('valid-token');
    const logout = spyOn(service, 'logout');
    service.getProfile().subscribe({ error: () => {} });
    http.expectOne(`${environment.apiUrl}/user/profile`).flush({}, { status: 403, statusText: 'Forbidden' });
    expect(logout).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe('valid-token');
  });
});
