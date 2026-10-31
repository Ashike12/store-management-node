import { OrderOperationsService } from './services/order-operations.service';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BusinessController } from './business.controller';
import { AuthModule } from '../auth/auth.module';
import { SharedService } from '../services/shared.service';
import { UserSchema } from '../shared/schemas/user.schema';
import { ProductSchema } from '../shared/schemas/product.schema';
import { ProductSellSchema } from '../shared/schemas/productSell.schema';
import { InvoiceSchema } from '../shared/schemas/invoice.schema';
import { OrderSchema } from '../shared/schemas/order.schema';
import { ProductService } from './services/product.service';
import { InvoiceService } from './services/invoice.service';
import { ClientOrderService } from './services/client-order.service';
import { AiSuggestionService } from './services/ai-suggestion.service';
import {
  InventoryBatch,
  InventoryBatchSchema,
} from '../shared/schemas/inventory-batch.schema';
import {
  InventoryItem,
  InventoryItemSchema,
} from '../shared/schemas/inventory-item.schema';
import { InventoryService } from './services/inventory.service';
import {
  ProductReview,
  ProductReviewSchema,
} from '../shared/schemas/product-review.schema';
import { ProductReviewService } from './services/product-review.service';
import { ProductReviewRateLimitGuard } from '../guards/product-review-rate-limit.guard';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: 'User', schema: UserSchema },
      { name: 'Product', schema: ProductSchema },
      { name: 'ProductSell', schema: ProductSellSchema },
      { name: 'Invoice', schema: InvoiceSchema },
      { name: 'Order', schema: OrderSchema },
      { name: InventoryBatch.name, schema: InventoryBatchSchema },
      { name: InventoryItem.name, schema: InventoryItemSchema },
      { name: ProductReview.name, schema: ProductReviewSchema },
    ]),
  ],
  controllers: [BusinessController],
  providers: [
    SharedService,
    ProductService,
    InvoiceService,
    ClientOrderService,
    OrderOperationsService,
    AiSuggestionService,
    InventoryService,
    ProductReviewService,
    ProductReviewRateLimitGuard,
  ],
})
export class BusinessModule {}
