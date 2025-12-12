import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Categoria } from '../interfaces/categoria';
import { map, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class CategoryServiceService {

  

  private http = inject(HttpClient)
 //private urlBase: string = "https://backend-eventlife.onrender.com/api/category/"
  private urlBase: string = "http://localhost:3000/api/category/"
  constructor() { }

  cargarCategoria(objeto: string){
    if (typeof window !== 'undefined' && window.localStorage){

      const token = localStorage.getItem('token');
      const headers = new HttpHeaders().set('token', `${token}`);
      return this.http.post(`${this.urlBase}new`, objeto, {headers})
    }else{
      return new Observable<Categoria[]>();
    }
  }

  getCategories(): Observable<Categoria[]> {
    if (typeof window !== 'undefined' && window.localStorage){

      const token = localStorage.getItem('token');
      const headers = new HttpHeaders().set('token', `${token}`);
      return this.http.get<{ categories: Categoria[] }>(`${this.urlBase}/`,{headers}).pipe(
        map(response => response.categories) // Asegúrate de acceder a 'categories'
      );
    }else{
      return new Observable<Categoria[]>
    }
  }

  getCategoryByID(id: number): Observable<Categoria> { // 
    return this.http.get<Categoria>(`${this.urlBase}/${id}`); 
  }

  deleteCategory(id: number): Observable<Categoria>{
    const token = localStorage.getItem('token');
    const headers = new HttpHeaders().set('token', `${token}`);
    return this.http.delete<Categoria>(`${this.urlBase}${id}`,{headers});
  }

}
