import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TradingViewComponent } from './trading-view/trading-view.component';

const routes: Routes = [
  {
    path: '',
    component: TradingViewComponent
  },
  {
    path: ':productId',
    component: TradingViewComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TradingRoutingModule { }
