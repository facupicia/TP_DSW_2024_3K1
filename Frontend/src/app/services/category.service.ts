import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { inject, Injectable } from '@angular/core';
import { Categoria } from '../interfaces/categoria';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class CategoryService {



  private http = inject(HttpClient)
  private urlBase: string = environment.apiUrl + "/category"
  constructor() { }

  cargarCategoria(objeto: string) {
    return this.http.post(`${this.urlBase}/new`, objeto)
  }

  getCategories(): Observable<Categoria[]> {
    return this.http.get<Categoria[]>(`${this.urlBase}`);
  }

  getCategoryByID(id: number): Observable<Categoria> { // 
    return this.http.get<Categoria>(`${this.urlBase}/${id}`);
  }

  deleteCategory(id: number): Observable<Categoria> {
    return this.http.delete<Categoria>(`${this.urlBase}/${id}`);

  }

}
