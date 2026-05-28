import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BusinessController } from './business.controller';
import { AuthModule } from '../auth/auth.module';
import { SharedService } from '../services/shared.service';
import { UserSchema } from '../shared/schemas/user.schema';
import { ProductSchema } from '../shared/schemas/product.schema';
import { ProductSellSchema } from '../shared/schemas/productSell.schema';
import { InvoiceSchema } from '../shared/schemas/invoice.schema';
import { ProductService } from './services/product.service';
import { InvoiceService } from './services/invoice.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: 'User', schema: UserSchema },
      { name: 'Product', schema: ProductSchema },
      { name: 'ProductSell', schema: ProductSellSchema },
      { name: 'Invoice', schema: InvoiceSchema }
    ]),
  ],
  controllers: [BusinessController],
  providers: [SharedService, ProductService, InvoiceService],
})
export class BusinessModule {}
