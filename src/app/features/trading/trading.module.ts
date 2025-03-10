import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';

import { TradingRoutingModule } from './trading-routing.module';
import { SharedModule } from '../../shared/shared.module';
import { TradingViewComponent } from './trading-view/trading-view.component';
import { OrderBookComponent } from './order-book/order-book.component';
import { TradeHistoryComponent } from './trade-history/trade-history.component';
import { OrderFormComponent } from './order-form/order-form.component';
import { LightweightChartComponent } from './lightweight-chart/lightweight-chart.component';

@NgModule({
  declarations: [
    // Legacy components (if any)
  ],
  imports: [
    // Angular modules
    CommonModule,
    TradingRoutingModule,
    FormsModule,
    ReactiveFormsModule,
    HttpClientModule,
    SharedModule,
    MatGridListModule,
    MatCardModule,
    MatDividerModule,
    
    // Standalone components
    TradingViewComponent,
    OrderBookComponent,
    TradeHistoryComponent,
    OrderFormComponent,
    LightweightChartComponent
  ],
  exports: [
    // Any components that need to be exposed outside this module
    TradingViewComponent
  ]
})
export class TradingModule { }
