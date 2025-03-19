import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LegalRoutingModule } from './legal-routing.module';
import { TermsComponent } from './terms/terms.component';
import { PrivacyComponent } from './privacy/privacy.component';

@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    LegalRoutingModule,
    // Import standalone components
    TermsComponent,
    PrivacyComponent
  ]
})
export class LegalModule { } 