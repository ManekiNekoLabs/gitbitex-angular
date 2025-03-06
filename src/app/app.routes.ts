import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'trading',
    pathMatch: 'full'
  },
  {
    path: 'trading',
    loadChildren: () => import('./features/trading/trading.module').then(m => m.TradingModule)
  },
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.module').then(m => m.AuthModule)
  },
  {
    path: 'account',
    loadChildren: () => import('./features/account/account.module').then(m => m.AccountModule)
  },
  {
    path: '**',
    redirectTo: 'trading'
  }
];
