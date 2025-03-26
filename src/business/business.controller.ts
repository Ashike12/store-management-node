import { Controller, Post, UseGuards, HttpCode, Body, Query, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { QueryRespone } from 'src/shared/response/query.response';
import { Query as ExpressQuery } from 'express-serve-static-core';
import { CommandResponse } from 'src/shared/response/command.response';
import { ProductService } from './services/product.service';
import { GetProductDto } from './dto/product/get-product.dto';
import { CreateProductDto } from './dto/product/create-product.dto';
import { UpdateProductDto } from './dto/product/update-product.dto';
import { DeleteProductDto } from './dto/product/delete-product.dto';
import { CreateInvoiceDto } from './dto/product-sell/create-invoice.dto';
import { GetInvoiceDto } from './dto/product-sell/get-invoice.dto';
import { InvoiceService } from './services/invoice.service';

@Controller('business')
export class BusinessController {

  constructor(private productService: ProductService,
    private invoiceService: InvoiceService
  ) {
  }

  @Post('GetProducts')
  @HttpCode(200)
  @UseGuards(AuthGuard())
  GetProducts(@Query() query: ExpressQuery,
    @Body() dto: GetProductDto): Promise<QueryRespone> {
    return this.productService.getProduct(query, dto);
  }

  @Post('CreateProduct')
  @HttpCode(200)
  @UseGuards(AuthGuard())
  CreateProduct(@Body() dto: CreateProductDto): Promise<CommandResponse> {
    return this.productService.createProduct(dto);
  }

  @Post('UpdateProduct')
  @HttpCode(200)
  @UseGuards(AuthGuard())
  UpdateProduct(@Body() dto: UpdateProductDto): Promise<CommandResponse> {
    return this.productService.updateProduct(dto);
  }

  @Post('DeleteProduct')
  @HttpCode(200)
  @UseGuards(AuthGuard())
  DeleteProduct(@Body() dto: DeleteProductDto): Promise<CommandResponse> {
    return this.productService.deleteById(dto.ItemId);
  }

  @Post('CreateInvoice')
  @HttpCode(200)
  @UseGuards(AuthGuard())
  CreateInvoice(@Body() dto: CreateInvoiceDto): Promise<CommandResponse> {
    return this.invoiceService.createInvoice(dto);
  }

  @Post('GetInvoice')
  @HttpCode(200)
  @UseGuards(AuthGuard())
  GetInvoice(@Query() query: ExpressQuery,
  @Body() dto: GetInvoiceDto): Promise<QueryRespone> {
    return this.invoiceService.getInvoiceList(query, dto);
  }

  @Post('DeleteInvoice')
  @HttpCode(200)
  @UseGuards(AuthGuard())
  DeleteInvoice(@Body() dto: DeleteProductDto): Promise<CommandResponse> {
    return this.invoiceService.deleteInvoiceById(dto.ItemId);
  }
}
