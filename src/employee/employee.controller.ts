import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { UserRoles } from '../shared/constant/roles.constant';
import { User } from '../shared/schemas/user.schema';
import {
  CreateEmployeeDto,
  CreatePaymentEntryDto,
  CreateWorkEntryDto,
  EmployeeIdDto,
  EmployeeOverviewDto,
  LedgerItemDto,
  ListEmployeesDto,
  ListNotificationsDto,
  NotificationDto,
  ResolveFeedbackDto,
  SubmitFeedbackDto,
  UpdateEmployeeDto,
  UpdatePaymentEntryDto,
  UpdateWorkEntryDto,
} from './dto/employee.dto';
import { EmployeeService } from './employee.service';

@Controller('employee')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  private user(req: Request) { return req['user'] as User; }
  private admin(req: Request) {
    const user = this.user(req);
    if (!user?.Roles?.includes(UserRoles.Admin)) throw new ForbiddenException('Admin access required');
    return user;
  }
  private employee(req: Request) {
    const user = this.user(req);
    if (!user?.Roles?.includes(UserRoles.Employee)) throw new ForbiddenException('Employee access required');
    return user;
  }

  @Post('CreateEmployee') @HttpCode(200) @UseGuards(AuthGuard())
  createEmployee(@Body() dto: CreateEmployeeDto, @Req() req: Request) {
    return this.employeeService.createEmployee(dto, this.admin(req));
  }

  @Post('ListEmployees') @HttpCode(200) @UseGuards(AuthGuard())
  listEmployees(@Body() dto: ListEmployeesDto, @Req() req: Request) {
    return this.employeeService.listEmployees(dto, this.admin(req));
  }

  @Post('UpdateEmployee') @HttpCode(200) @UseGuards(AuthGuard())
  updateEmployee(@Body() dto: UpdateEmployeeDto, @Req() req: Request) {
    return this.employeeService.updateEmployee(dto, this.admin(req));
  }

  @Post('DeactivateEmployee') @HttpCode(200) @UseGuards(AuthGuard())
  deactivateEmployee(@Body() dto: EmployeeIdDto, @Req() req: Request) {
    return this.employeeService.deactivateEmployee(dto.EmployeeId, this.admin(req));
  }

  @Post('GetOverview') @HttpCode(200) @UseGuards(AuthGuard())
  getOverview(@Body() dto: EmployeeOverviewDto, @Req() req: Request) {
    const user = this.user(req);
    if (!user?.Roles?.some(role => [UserRoles.Admin, UserRoles.Employee].includes(role))) {
      throw new ForbiddenException('Employee ledger access required');
    }
    return this.employeeService.getOverview(dto, user);
  }

  @Post('CreateWorkEntry') @HttpCode(200) @UseGuards(AuthGuard())
  createWorkEntry(@Body() dto: CreateWorkEntryDto, @Req() req: Request) {
    return this.employeeService.createWorkEntry(dto, this.admin(req));
  }

  @Post('UpdateWorkEntry') @HttpCode(200) @UseGuards(AuthGuard())
  updateWorkEntry(@Body() dto: UpdateWorkEntryDto, @Req() req: Request) {
    return this.employeeService.updateWorkEntry(dto, this.admin(req));
  }

  @Post('DeleteWorkEntry') @HttpCode(200) @UseGuards(AuthGuard())
  deleteWorkEntry(@Body() dto: LedgerItemDto, @Req() req: Request) {
    return this.employeeService.deleteWorkEntry(dto.ItemId, this.admin(req));
  }

  @Post('CreatePaymentEntry') @HttpCode(200) @UseGuards(AuthGuard())
  createPaymentEntry(@Body() dto: CreatePaymentEntryDto, @Req() req: Request) {
    return this.employeeService.createPaymentEntry(dto, this.admin(req));
  }

  @Post('UpdatePaymentEntry') @HttpCode(200) @UseGuards(AuthGuard())
  updatePaymentEntry(@Body() dto: UpdatePaymentEntryDto, @Req() req: Request) {
    return this.employeeService.updatePaymentEntry(dto, this.admin(req));
  }

  @Post('DeletePaymentEntry') @HttpCode(200) @UseGuards(AuthGuard())
  deletePaymentEntry(@Body() dto: LedgerItemDto, @Req() req: Request) {
    return this.employeeService.deletePaymentEntry(dto.ItemId, this.admin(req));
  }

  @Post('SubmitFeedback') @HttpCode(200) @UseGuards(AuthGuard())
  submitFeedback(@Body() dto: SubmitFeedbackDto, @Req() req: Request) {
    return this.employeeService.submitFeedback(dto, this.employee(req));
  }

  @Post('ResolveFeedback') @HttpCode(200) @UseGuards(AuthGuard())
  resolveFeedback(@Body() dto: ResolveFeedbackDto, @Req() req: Request) {
    return this.employeeService.resolveFeedback(dto, this.admin(req));
  }

  @Post('ListNotifications') @HttpCode(200) @UseGuards(AuthGuard())
  listNotifications(@Body() dto: ListNotificationsDto, @Req() req: Request) {
    return this.employeeService.listNotifications(dto, this.admin(req));
  }

  @Post('MarkNotificationRead') @HttpCode(200) @UseGuards(AuthGuard())
  markNotificationRead(@Body() dto: NotificationDto, @Req() req: Request) {
    return this.employeeService.markNotificationRead(dto.FeedbackId, this.admin(req));
  }
}
