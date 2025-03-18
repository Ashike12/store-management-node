import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BusinessController } from './business.controller';
import { AuthModule } from 'src/auth/auth.module';
import { SharedService } from 'src/services/shared.service';
import { UserSchema } from 'src/shared/schemas/user.schema';
import { ProductSchema } from 'src/shared/schemas/product.schema';
import { ProductSellSchema } from 'src/shared/schemas/productSell.schema';
import { InvoiceSchema } from 'src/shared/schemas/invoice.schema';
import { ProductService } from './services/product.service';

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
  providers: [SharedService, ProductService],
})
export class BusinessModule {}
