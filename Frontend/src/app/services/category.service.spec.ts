import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CategoryService } from './category.service';

describe('Category API contract', () => {
  let service: CategoryService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(CategoryService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('extracts the created category and invalidates the listing', () => {
    service.getCategories().subscribe(); http.expectOne(r => r.url.endsWith('/category')).flush([]);
    service.cargarCategoria({ name: 'Teatro' }).subscribe(category => expect(category).toEqual({ id: 4, name: 'Teatro' }));
    const request = http.expectOne(r => r.url.endsWith('/category/new'));
    expect(request.request.body).toEqual({ name: 'Teatro' });
    request.flush({ message: 'Category created successfully', category: { id: 4, name: 'Teatro' } });
    service.getCategories().subscribe(); http.expectOne(r => r.url.endsWith('/category')).flush([{ id: 4, name: 'Teatro' }]);
  });
  it('allows retrying the same cached observable after a network error', () => {
    const categories = service.getCategories();
    categories.subscribe({ error: () => {} });
    http.expectOne(r => r.url.endsWith('/category')).error(new ProgressEvent('error'));
    categories.subscribe(value => expect(value).toEqual([]));
    http.expectOne(r => r.url.endsWith('/category')).flush([]);
  });
});
