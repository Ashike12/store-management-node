import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

import { Query as ExpressQuery } from 'express-serve-static-core';
import { AuthGuard } from '@nestjs/passport';
import { CommandResponse } from '../shared/response/command.response';
import { QueryRespone } from '../shared/response/query.response';
import { GetByEmailDto } from './dto/getByEmail.dto';
import { DeleteUserDto } from './dto/deleteuser.dto';

@Controller('user')
export class UserController {
  constructor(private userService: UserService) {}

  @Get('get')
  @HttpCode(200)
  @UseGuards(AuthGuard())
  async getAllUser(@Query() query: ExpressQuery, @Req() req): Promise<QueryRespone> {
    var userInfo = req['user'];
    return this.userService.findAll(query, userInfo);
  }
  
  @Get('getById/:id')
  @HttpCode(200)
  //@UseGuards(AuthGuard())
  async getById(@Param() params: any): Promise<QueryRespone> {
    return this.userService.findById(params.id);
  }

  @Post('getByEmail')
  @HttpCode(200)
  @UseGuards(AuthGuard())
  async getByEmail(
    @Body()
    dto: GetByEmailDto,
    @Req() req
  ): Promise<QueryRespone> {
    var userInfo = req['user'];
    return this.userService.findByEmail(dto.Email, userInfo);
  }

  @Post('createCustomer')
  @HttpCode(200)
  @UseGuards(AuthGuard())
  async createCustomer(
    @Body()
    userDto: CreateUserDto,
    @Req() req,
  ): Promise<CommandResponse> {
    var userInfo = req['user'];
    return this.userService.createCustomer(userDto, userInfo);
  }


  @Post('update')
  @HttpCode(200)
  @UseGuards(AuthGuard())
  async updateUser(
    @Body()
    user: UpdateUserDto,
    @Req() req,
  ): Promise<CommandResponse> {
    var userInfo = req['user'];
    return this.userService.updateById(user, userInfo);
  }

  @Post('delete')
  @HttpCode(200)
  @UseGuards(AuthGuard())
  async deleteUser(
    @Body()
    deleteUser: DeleteUserDto,
    @Req() req,
  ): Promise<CommandResponse> {
    var userInfo = req['user'];
    return this.userService.deleteById(deleteUser.ItemId, userInfo);
  }
}
