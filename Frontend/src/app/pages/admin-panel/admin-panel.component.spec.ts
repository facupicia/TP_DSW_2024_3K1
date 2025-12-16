import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminPanelComponent } from './admin-panel.component';
import { HttpClientTestingModule } from '@angular/common/http/testing';

describe('AdminPanelComponent (mobile)', () => {
  let component: AdminPanelComponent;
  let fixture: ComponentFixture<AdminPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminPanelComponent, HttpClientTestingModule]
    }).compileComponents();
    fixture = TestBed.createComponent(AdminPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('mobile menu toggles open/close', () => {
    expect(component.isMobileNavOpen).toBeFalse();
    component.toggleMobileNav();
    expect(component.isMobileNavOpen).toBeTrue();
    component.toggleMobileNav();
    expect(component.isMobileNavOpen).toBeFalse();
  });

  it('loads users only when users tab is active', () => {
    spyOn<any>(component, 'cargarUsuarios').and.callThrough();
    component.cambiarTab('users');
    expect((component as any).cargarUsuarios).toHaveBeenCalled();
  });

  it('touch targets class present', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    component.cambiarTab('categories');
    fixture.detectChanges();
    const buttons = compiled.querySelectorAll('.tap-target');
    expect(buttons.length).toBeGreaterThan(0);
  });
});

