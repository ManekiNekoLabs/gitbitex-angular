import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ResizableDirective } from './directives/resizable.directive';

@NgModule({
  declarations: [
    // Remove ResizableDirective from declarations since it's standalone
  ],
  imports: [
    CommonModule,
    ResizableDirective // Import it instead
  ],
  exports: [
    ResizableDirective
  ]
})
export class SharedModule { }
