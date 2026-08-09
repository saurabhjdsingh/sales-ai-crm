import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CountryOption {
  code: string;
  name: string;
}

@Injectable({
  providedIn: 'root'
})
export class CountryService {
  private http = inject(HttpClient);
  private apiUrl = '/api/v1/common/countries/';

  getCountries(): Observable<CountryOption[]> {
    return this.http.get<CountryOption[]>(this.apiUrl);
  }
}
