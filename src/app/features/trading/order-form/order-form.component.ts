import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Product } from '../../../core/models/product.model';
import { ProductService } from '../../../core/services/product.service';
import { OrderService } from '../../../core/services/order.service';
import { OrderSide, OrderType } from '../../../core/models/order.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-order-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './order-form.component.html',
  styleUrl: './order-form.component.scss'
})
export class OrderFormComponent implements OnInit, OnChanges, OnDestroy {
  @Input() productId: string | undefined;
  
  product: Product | null = null;
  orderType: OrderType = OrderType.LIMIT;
  orderSide: OrderSide = OrderSide.BUY;
  
  // For template binding
  OrderType = OrderType;
  OrderSide = OrderSide;
  
  orderForm: FormGroup;
  loading = false;
  error = false;
  
  // Mock user balance
  userBalance = {
    base: 1.5, // e.g., BTC
    quote: 75000 // e.g., USD
  };

  private subscriptions: Subscription[] = [];
  
  constructor(
    private fb: FormBuilder,
    private productService: ProductService,
    private orderService: OrderService
  ) {
    this.orderForm = this.createOrderForm();
  }
  
  ngOnInit(): void {
    this.updateFormValidators();
  }
  
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['productId'] && this.productId) {
      this.loadProduct();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
  
  loadProduct(): void {
    if (!this.productId) return;
    
    this.loading = true;
    this.error = false;
    
    this.subscriptions.push(
      this.productService.getProduct(this.productId).subscribe({
        next: (product) => {
          this.product = product;
          this.loading = false;
          this.updateFormValidators();
        },
        error: (error) => {
          console.error('Error loading product:', error);
          this.error = true;
          this.loading = false;
        }
      })
    );
  }
  
  createOrderForm(): FormGroup {
    return this.fb.group({
      price: [null, [Validators.required, Validators.min(0)]],
      amount: [null, [Validators.required, Validators.min(0)]],
      total: [{ value: null, disabled: true }]
    });
  }
  
  updateFormValidators(): void {
    const priceControl = this.orderForm.get('price');
    
    if (this.orderType === OrderType.MARKET) {
      priceControl?.disable();
      priceControl?.clearValidators();
    } else {
      priceControl?.enable();
      priceControl?.setValidators([Validators.required, Validators.min(0)]);
    }
    
    priceControl?.updateValueAndValidity();
  }
  
  setOrderType(type: OrderType): void {
    this.orderType = type;
    this.updateFormValidators();
  }
  
  setOrderSide(side: OrderSide): void {
    this.orderSide = side;
  }
  
  calculateTotal(): void {
    const price = this.orderForm.get('price')?.value || 0;
    const amount = this.orderForm.get('amount')?.value || 0;
    
    if (price && amount) {
      const total = price * amount;
      this.orderForm.get('total')?.setValue(total.toFixed(2));
    }
  }
  
  placeOrder(): void {
    if (this.orderForm.invalid || !this.product || !this.productId) {
      return;
    }
    
    const price = this.orderForm.get('price')?.value;
    const size = this.orderForm.get('amount')?.value;
    
    console.log('Placing order:', {
      productId: this.productId,
      side: this.orderSide,
      type: this.orderType,
      price: this.orderType === OrderType.LIMIT ? price : undefined,
      size
    });
    
    // Call the order service to place the order
    this.subscriptions.push(
      this.orderService.createOrder(
        this.productId,
        this.orderSide,
        this.orderType,
        size.toString(),
        this.orderType === OrderType.LIMIT ? price.toString() : undefined
      ).subscribe({
        next: (response) => {
          console.log('Order placed successfully:', response);
          this.orderForm.reset();
        },
        error: (error) => {
          console.error('Error placing order:', error);
          // Here you would show an error message to the user
        }
      })
    );
  }
  
  getMaxAmount(): number {
    if (!this.product) return 0;
    
    if (this.orderSide === OrderSide.BUY) {
      const price = this.orderForm.get('price')?.value || 0;
      return price > 0 ? this.userBalance.quote / price : 0;
    } else {
      return this.userBalance.base;
    }
  }
  
  setMaxAmount(): void {
    const maxAmount = this.getMaxAmount();
    this.orderForm.get('amount')?.setValue(maxAmount.toFixed(4));
    this.calculateTotal();
  }
}
