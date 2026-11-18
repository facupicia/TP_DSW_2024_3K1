import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { AdminPanelComponent } from './admin-panel.component';
import { AuthService } from '../../services/auth.service';
import { AdminService } from '../../services/admin.service';
import { CategoryService } from '../../services/category.service';
import { ToastService } from '../../services/toast.service';

@Component({ imports: [AdminPanelComponent], template: '<app-admin-panel />' })
class Host {}

describe('Admin asynchronous state', () => {
  let fixture: ComponentFixture<Host>;
  let component: AdminPanelComponent;
  let currentUser: BehaviorSubject<any>;
  let categories: Subject<any[]>;
  let created: Subject<any>;
  let users: Subject<any>;
  let categoryService: any;
  let overview: jasmine.Spy;

  beforeEach(async () => {
    currentUser = new BehaviorSubject(null);
    categories = new Subject(); created = new Subject(); users = new Subject();
    overview = jasmine.createSpy().and.returnValue(of({ success: false }));
    categoryService = {
      getCategories: () => categories,
      cargarCategoria: jasmine.createSpy().and.returnValue(created),
      deleteCategory: () => of({})
    };
    await TestBed.configureTestingModule({ imports: [Host], providers: [
      { provide: AuthService, useValue: { currentUser$: currentUser, getUsers: () => users } },
      { provide: CategoryService, useValue: categoryService },
      { provide: AdminService, useValue: { getOverview: overview } },
      { provide: ToastService, useValue: {} }
    ] }).overrideComponent(AdminPanelComponent, { set: { imports: [], template: '{{categorias.length}}|{{loadingCategories}}|{{usuarios.length}}|{{loadingUsers}}' } }).compileComponents();
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    component = fixture.debugElement.query(By.directive(AdminPanelComponent)).componentInstance;
  });

  afterEach(() => fixture.destroy());

  it('waits for the hydrated user and loads overview once', () => {
    expect(overview).not.toHaveBeenCalled();
    currentUser.next({ id: 1, roles: ['admin'] });
    currentUser.next({ id: 1, roles: ['admin'] });
    expect(overview).toHaveBeenCalledTimes(1);
  });

  it('renders category responses through OnPush and sends an object on create', () => {
    component.cargarCategorias(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('0|true');
    categories.next([{ id: 1, name: 'Música' }]); categories.complete(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('1|false');
    component.formCategory.setValue({ name: '  Teatro  ' }); component.crearCategoria();
    expect(categoryService.cargarCategoria).toHaveBeenCalledWith({ name: 'Teatro' });
    created.next({ id: 2, name: 'Teatro' }); created.complete(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('2|false');
  });

  it('renders asynchronous users and resets loading after failure', () => {
    component.userSearchInput = component.userSearch = 'test'; component.cargarUsuarios(); fixture.detectChanges();
    users.next({ data: [{ id: 4, roles: ['user'] }], total: 1, page: 1, limit: 20, totalPages: 1 });
    users.complete(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('|1|false');
    component.cargarCategorias(); categories.error(new Error('offline')); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('0|false');
  });
});
