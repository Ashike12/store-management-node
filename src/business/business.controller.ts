import { Controller, Post, UseGuards, HttpCode, Body, Query, Req, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { QueryRespone } from '../shared/response/query.response';
import { Query as ExpressQuery } from 'express-serve-static-core';
import { CommandResponse } from '../shared/response/command.response';
import { ProductService } from './services/product.service';
import { GetProductDto } from './dto/product/get-product.dto';
import { CreateProductDto } from './dto/product/create-product.dto';
import { UpdateProductDto } from './dto/product/update-product.dto';
import { DeleteProductDto } from './dto/product/delete-product.dto';
import { CreateInvoiceDto } from './dto/product-sell/create-invoice.dto';
import { GetInvoiceDto } from './dto/product-sell/get-invoice.dto';
import { InvoiceService } from './services/invoice.service';
import { UpdateInvoiceDto } from './dto/product-sell/update-invoice.dto';
import { AddProductionDto } from './dto/product/add-production.dto';
import { Request } from 'express';
import { User } from '../shared/schemas/user.schema';
import { UserRoles } from '../shared/constant/roles.constant';
import { CreateClientOrderDto } from './dto/client-order/create-client-order.dto';
import { ClientOrderService } from './services/client-order.service';

@Controller('business')
export class BusinessController {

  constructor(private productService: ProductService,
    private invoiceService: InvoiceService,
    private clientOrderService: ClientOrderService
  ) {
  }

  private ensureWholesalerReadOnly(user?: User) {
    if (user?.Roles?.includes(UserRoles.WholeSaler) && !user.Roles.includes(UserRoles.Admin)) {
      throw new ForbiddenException('Wholesaler accounts have read-only access');
    }
  }

  @Post('GetProducts')
  @HttpCode(200)
  @UseGuards(AuthGuard())
  GetProducts(@Query() query: ExpressQuery,
    @Body() dto: GetProductDto,
    @Req() req: Request): Promise<QueryRespone> {
    this.ensureWholesalerReadOnly(req['user'] as User);
    return this.productService.getProduct(query, dto);
  }

  @Post('GetClientProducts')
  @HttpCode(200)
  GetClientProducts(@Query() query: ExpressQuery,
    @Body() dto: GetProductDto): Promise<QueryRespone> {
    return this.productService.getClientProduct(query, dto);
  }

  @Post('CreateClientOrder')
  @HttpCode(200)
  CreateClientOrder(@Body() dto: CreateClientOrderDto,
    @Req() req: Request): Promise<CommandResponse> {
    const customerIp = req.ip || req.socket?.remoteAddress;
    return this.clientOrderService.createOrder(dto, customerIp);
  }

  @Post('CreateProduct')
  @HttpCode(200)
  @UseGuards(AuthGuard())
  CreateProduct(@Body() dto: CreateProductDto,
    @Req() req: Request): Promise<CommandResponse> {
    this.ensureWholesalerReadOnly(req['user'] as User);
    return this.productService.createProduct(dto);
  }

  @Post('UpdateProduct')
  @HttpCode(200)
  @UseGuards(AuthGuard())
  UpdateProduct(@Body() dto: UpdateProductDto,
    @Req() req: Request): Promise<CommandResponse> {
    this.ensureWholesalerReadOnly(req['user'] as User);
    return this.productService.updateProduct(dto);
  }

  @Post('DeleteProduct')
  @HttpCode(200)
  @UseGuards(AuthGuard())
  DeleteProduct(@Body() dto: DeleteProductDto,
    @Req() req: Request): Promise<CommandResponse> {
    this.ensureWholesalerReadOnly(req['user'] as User);
    return this.productService.deleteById(dto.ItemId);
  }

  @Post('CreateInvoice')
  @HttpCode(200)
  @UseGuards(AuthGuard())
  CreateInvoice(@Body() dto: CreateInvoiceDto,
    @Req() req: Request): Promise<CommandResponse> {
    this.ensureWholesalerReadOnly(req['user'] as User);
    return this.invoiceService.createInvoice(dto);
  }

  
  @Post('UpdateInvoice')
  @HttpCode(200)
  @UseGuards(AuthGuard())
  UpdateInvoice(@Body() dto: UpdateInvoiceDto,
    @Req() req: Request): Promise<CommandResponse> {
    this.ensureWholesalerReadOnly(req['user'] as User);
    return this.invoiceService.updateInvoice(dto);
  }

  @Post('GetInvoice')
  @HttpCode(200)
  @UseGuards(AuthGuard())
  GetInvoice(@Query() query: ExpressQuery,
  @Body() dto: GetInvoiceDto,
  @Req() req: Request): Promise<QueryRespone> {
    const user = req['user'] as User;
    return this.invoiceService.getInvoiceList(query, dto, user);
  }

  @Post('DeleteInvoice')
  @HttpCode(200)
  @UseGuards(AuthGuard())
  DeleteInvoice(@Body() dto: DeleteProductDto,
    @Req() req: Request): Promise<CommandResponse> {
    this.ensureWholesalerReadOnly(req['user'] as User);
    return this.invoiceService.deleteInvoiceById(dto.ItemId);
  }

  @Post('GetDashboardData')
  @HttpCode(200)
  @UseGuards(AuthGuard())
  GetDashboardData(@Req() req: Request): Promise<QueryRespone> {
    const user = req['user'] as User;
    return this.invoiceService.getDashboardStatsData(user);
  }

  @Post('AddProduction')
  @HttpCode(200)
  @UseGuards(AuthGuard())
  AddProduction(@Body() dto: AddProductionDto,
    @Req() req: Request): Promise<CommandResponse> {
    this.ensureWholesalerReadOnly(req['user'] as User);
    return this.productService.addProduction(dto);
  }
}
