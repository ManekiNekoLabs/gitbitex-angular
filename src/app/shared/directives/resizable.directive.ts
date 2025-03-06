import { Directive, ElementRef, HostListener, Input, OnInit, Renderer2 } from '@angular/core';

@Directive({
  selector: '[appResizable]',
  standalone: true
})
export class ResizableDirective implements OnInit {
  @Input() resizableGrabWidth = 8;
  @Input() resizableMinWidth = 200;
  @Input() resizableMaxWidth = 800;

  private dragging = false;
  private resizer: HTMLElement | null = null;

  constructor(private el: ElementRef, private renderer: Renderer2) { }

  ngOnInit() {
    // Create a resizer element
    this.resizer = this.renderer.createElement('div');
    this.renderer.addClass(this.resizer, 'resizer-handle');
    this.renderer.setStyle(this.resizer, 'position', 'absolute');
    this.renderer.setStyle(this.resizer, 'right', '0');
    this.renderer.setStyle(this.resizer, 'top', '0');
    this.renderer.setStyle(this.resizer, 'height', '100%');
    this.renderer.setStyle(this.resizer, 'width', `${this.resizableGrabWidth}px`);
    this.renderer.setStyle(this.resizer, 'cursor', 'col-resize');
    this.renderer.setStyle(this.resizer, 'z-index', '10');
    
    // Add hover effect
    this.renderer.listen(this.resizer, 'mouseenter', () => {
      this.renderer.setStyle(this.resizer, 'background', 'rgba(240, 185, 11, 0.3)');
    });
    this.renderer.listen(this.resizer, 'mouseleave', () => {
      if (!this.dragging) {
        this.renderer.setStyle(this.resizer, 'background', 'transparent');
      }
    });

    // Add the resizer to the element
    this.renderer.appendChild(this.el.nativeElement, this.resizer);

    // Set position relative to host element
    this.renderer.setStyle(this.el.nativeElement, 'position', 'relative');
    this.renderer.setStyle(this.el.nativeElement, 'overflow', 'hidden');

    // Add mousedown event listener to the resizer
    this.renderer.listen(this.resizer, 'mousedown', (event: MouseEvent) => {
      this.dragging = true;
      this.renderer.setStyle(this.resizer, 'background', 'rgba(240, 185, 11, 0.5)');
      event.preventDefault();
    });
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (this.dragging) {
      // Calculate the new width
      const containerRect = this.el.nativeElement.parentElement.getBoundingClientRect();
      const hostRect = this.el.nativeElement.getBoundingClientRect();
      
      // Calculate the new width based on mouse position
      let newWidth = event.clientX - hostRect.left;
      
      // Apply min/max constraints
      newWidth = Math.max(this.resizableMinWidth, Math.min(newWidth, this.resizableMaxWidth));
      
      // Set the new width
      this.renderer.setStyle(this.el.nativeElement, 'width', `${newWidth}px`);
      
      // Prevent text selection during resize
      event.preventDefault();
    }
  }

  @HostListener('document:mouseup')
  onMouseUp() {
    if (this.dragging) {
      this.dragging = false;
      this.renderer.setStyle(this.resizer, 'background', 'transparent');
    }
  }
} 