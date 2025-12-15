import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { inject, Injectable } from '@angular/core';
import { Categoria } from '../interfaces/categoria';
import { map, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class CategoryService {



  private http = inject(HttpClient)
  private urlBase: string = environment.apiUrl + "/category/"
  constructor() { }

  cargarCategoria(objeto: string) {
    if (typeof window !== 'undefined' && window.localStorage) {

      return this.http.post(`${this.urlBase}new`, objeto)

    } else {
      return new Observable<Categoria[]>();
    }
  }

  getCategories(): Observable<Categoria[]> {
    if (typeof window !== 'undefined' && window.localStorage) {

      return this.http.get<{ categories: Categoria[] }>(`${this.urlBase}/`).pipe(

        map(response => response.categories) // Asegúrate de acceder a 'categories'
      );
    } else {
      return new Observable<Categoria[]>
    }
  }

  getCategoryByID(id: number): Observable<Categoria> { // 
    return this.http.get<Categoria>(`${this.urlBase}/${id}`);
  }

  deleteCategory(id: number): Observable<Categoria> {
    return this.http.delete<Categoria>(`${this.urlBase}${id}`);

  }

}
