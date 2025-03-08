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
import { ChartComponent } from './chart/chart.component';

@NgModule({
  declarations: [
    // Remove standalone components from declarations
  ],
  imports: [
    CommonModule,
    TradingRoutingModule,
    FormsModule,
    ReactiveFormsModule,
    HttpClientModule,
    SharedModule,
    MatGridListModule,
    MatCardModule,
    MatDividerModule,
    // Import standalone components
    TradingViewComponent,
    OrderBookComponent,
    TradeHistoryComponent,
    OrderFormComponent,
    ChartComponent
  ]
})
export class TradingModule { }
