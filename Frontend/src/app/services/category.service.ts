import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { inject, Injectable } from '@angular/core';
import { Categoria } from '../interfaces/categoria';
import { Observable, shareReplay, tap } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class CategoryService {

  private http = inject(HttpClient)
  private urlBase: string = environment.apiUrl + "/category"

  private categoriesCache$: Observable<Categoria[]> | null = null;

  constructor() { }

  cargarCategoria(objeto: { name: string }) {
    return this.http.post(`${this.urlBase}/new`, objeto).pipe(
      tap(() => this.clearCategoriesCache())
    );
  }

  getCategories(): Observable<Categoria[]> {
    if (!this.categoriesCache$) {
      this.categoriesCache$ = this.http.get<Categoria[]>(`${this.urlBase}`).pipe(
        shareReplay({ bufferSize: 1, refCount: false })
      );
    }
    return this.categoriesCache$;
  }

  clearCategoriesCache(): void {
    this.categoriesCache$ = null;
  }

  getCategoryByID(id: number): Observable<Categoria> {
    return this.http.get<Categoria>(`${this.urlBase}/${id}`);
  }

  deleteCategory(id: number): Observable<Categoria> {
    return this.http.delete<Categoria>(`${this.urlBase}/${id}`).pipe(
      tap(() => this.clearCategoriesCache())
    );
  }

}
