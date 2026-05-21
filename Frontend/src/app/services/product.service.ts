import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Product } from '../interfaces/product';

@Injectable({
    providedIn: 'root'
})
export class ProductService {

    private http = inject(HttpClient);
    private urlBase: string = environment.apiUrl + "/product";

    getMyCatalog(): Observable<Product[]> {
        return this.http.get<Product[]>(this.urlBase);
    }

    createProduct(product: Partial<Product>): Observable<Product> {
        return this.http.post<Product>(this.urlBase, product);
    }

    updateProduct(id: number, product: Partial<Product>): Observable<Product> {
        return this.http.put<Product>(`${this.urlBase}/${id}`, product);
    }

    deleteProduct(id: number): Observable<void> {
        return this.http.delete<void>(`${this.urlBase}/${id}`);
    }
}
