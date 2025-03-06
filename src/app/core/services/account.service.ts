import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Wallet, Transaction } from '../models/wallet.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AccountService {
  private readonly API_URL = `${environment.apiUrl}/accounts`;

  constructor(private http: HttpClient) { }

  getWallets(): Observable<Wallet[]> {
    return this.http.get<Wallet[]>(this.API_URL);
  }

  getWallet(currency: string): Observable<Wallet> {
    return this.http.get<Wallet>(`${this.API_URL}/${currency}`);
  }

  getTransactions(currency?: string): Observable<Transaction[]> {
    let url = `${this.API_URL}/transactions`;
    if (currency) {
      url += `?currency=${currency}`;
    }
    return this.http.get<Transaction[]>(url);
  }

  deposit(currency: string, amount: string): Observable<Transaction> {
    return this.http.post<Transaction>(`${this.API_URL}/deposit`, {
      currency,
      amount
    });
  }

  withdraw(currency: string, amount: string, address: string): Observable<Transaction> {
    return this.http.post<Transaction>(`${this.API_URL}/withdraw`, {
      currency,
      amount,
      address
    });
  }
}
