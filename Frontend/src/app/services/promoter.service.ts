import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';
import {
  Promoter,
  CreatePromoterRequest,
  UpdatePromoterRequest,
  PromoterStats,
  PromoterStatsDetail,
  PromoterProfile,
  MyPromoterStats,
  EventPromoterStats,
  MyAssignedEvents
} from '../interfaces/promoter';

@Injectable({
  providedIn: 'root'
})
export class PromoterService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl + '/promoter';

  /**
   * Get all promoters for the current organizer
   */
  getMyPromoters(): Observable<Promoter[]> {
    return this.http.get<Promoter[]>(`${this.baseUrl}`);
  }

  /**
   * Get a specific promoter by ID
   */
  getPromoterById(id: number): Observable<Promoter> {
    return this.http.get<Promoter>(`${this.baseUrl}/${id}`);
  }

  /**
   * Add a new promoter to the group by email
   */
  addPromoterByEmail(email: string, commissionPercentage?: number, notes?: string): Observable<{ message: string; promoter: Promoter }> {
    return this.http.post<{ message: string; promoter: Promoter }>(`${this.baseUrl}`, {
      email,
      commissionPercentage,
      notes
    });
  }

  /**
   * Update a promoter's information
   */
  updatePromoter(id: number, data: UpdatePromoterRequest): Observable<{ message: string; promoter: Partial<Promoter> }> {
    return this.http.put<{ message: string; promoter: Partial<Promoter> }>(`${this.baseUrl}/${id}`, data);
  }

  /**
   * Remove a promoter from the group (soft delete)
   */
  removePromoter(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.baseUrl}/${id}`);
  }

  /**
   * Assign a promoter to an event
   */
  assignToEvent(promoterGroupId: number, eventId: number, customCommissionPercentage?: number): Observable<{ message: string; assignment: any }> {
    return this.http.post<{ message: string; assignment: any }>(`${this.baseUrl}/${promoterGroupId}/events`, {
      eventId,
      customCommissionPercentage
    });
  }

  /**
   * Remove a promoter from an event
   */
  removeFromEvent(promoterGroupId: number, eventId: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.baseUrl}/${promoterGroupId}/events/${eventId}`);
  }

  /**
   * Get statistics for all promoters
   */
  getPromotersStats(eventId?: number, startDate?: string, endDate?: string): Observable<{ promoters: PromoterStats[]; summary: any }> {
    let params: any = {};
    if (eventId) params.eventId = eventId;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    
    return this.http.get<{ promoters: PromoterStats[]; summary: any }>(`${this.baseUrl}/stats/overview`, { params });
  }

  /**
   * Get detailed statistics for a specific promoter
   */
  getPromoterStatsById(id: number, eventId?: number, startDate?: string, endDate?: string): Observable<PromoterStatsDetail> {
    let params: any = {};
    if (eventId) params.eventId = eventId;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    
    return this.http.get<PromoterStatsDetail>(`${this.baseUrl}/${id}/stats`, { params });
  }

  /**
   * Get events with promoter sales statistics
   */
  getEventsPromoterStats(): Observable<{ events: EventPromoterStats[]; summary: any }> {
    return this.http.get<{ events: EventPromoterStats[]; summary: any }>(`${this.baseUrl}/stats/events`);
  }

  // ==================== PROMOTER (RRPP) ENDPOINTS ====================

  /**
   * Get profile for logged in promoter
   */
  getPromoterProfile(): Observable<PromoterProfile> {
    return this.http.get<PromoterProfile>(`${this.baseUrl}/profile`);
  }

  /**
   * Get own statistics (for logged in promoter)
   */
  getMyStats(eventId?: number, startDate?: string, endDate?: string): Observable<MyPromoterStats> {
    let params: any = {};
    if (eventId) params.eventId = eventId;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    
    return this.http.get<MyPromoterStats>(`${this.baseUrl}/stats/me`, { params });
  }

  /**
   * Check if organizer has events
   */
  checkHasEvents(): Observable<{ hasEvents: boolean; eventCount: number }> {
    return this.http.get<{ hasEvents: boolean; eventCount: number }>(`${this.baseUrl}/has-events`);
  }

  /**
   * Get my assigned events with shareable links (for logged in promoter)
   */
  getMyAssignedEvents(): Observable<MyAssignedEvents> {
    return this.http.get<MyAssignedEvents>(`${this.baseUrl}/my-events`);
  }
}
