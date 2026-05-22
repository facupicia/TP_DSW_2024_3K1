import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type ImageUploadKind = 'event' | 'profile' | 'product';

export interface ImageUploadResponse {
  url: string;
  publicId: string;
}

@Injectable({
  providedIn: 'root'
})
export class ImageUploadService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/upload`;

  uploadImage(file: File, kind: ImageUploadKind): Observable<ImageUploadResponse> {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('kind', kind);

    return this.http.post<ImageUploadResponse>(`${this.baseUrl}/image`, formData);
  }
}
