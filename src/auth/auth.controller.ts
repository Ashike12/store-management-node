import { BadRequestException, Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SignUpDto } from './dto/signup.dto';
import { RefreshDto } from './dto/RefreshDto';
import { SetPasswordDto } from './dto/set-password.dto';
import { CommandResponse } from '../shared/response/command.response';
import { AuthGuard } from '@nestjs/passport';
import { GetLoginLogsDto } from './dto/getloginlog.dto';
import { QueryRespone } from '../shared/response/query.response';
import { Request } from 'express';
import { User } from '../shared/schemas/user.schema';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('/signup')
  @HttpCode(200)
  signUp(@Body() signUpDto: SignUpDto): Promise<boolean> {
    return this.authService.signUp(signUpDto);
  }

  @Post('/token')
  @HttpCode(200)
  login(@Body() loginDto: LoginDto): Promise<{ login_token: string, refresh_token: string }> {
    if(loginDto.GrantType == 'password') {
      return this.authService.login(loginDto);
    } 
    else if(loginDto.GrantType == 'authenticate_site') {
      //ToDo will return an annonymous token
      return this.authService.getAnonymousToken();
    }
    throw new BadRequestException("GrantType invalid, it can be either 'password' or 'authenticate_site'");
  }

  @Post('/refresh')
  @HttpCode(200)
  //@UseGuards(AuthGuard())
  refresh(@Body() refreshDto: RefreshDto): Promise<{ login_token: string }> {
    return this.authService.refresh(refreshDto);
  }

  @Post('/setPassword')
  @HttpCode(200)
  setPassword(@Body() dto: SetPasswordDto): Promise<CommandResponse> {
    return this.authService.setPassword(dto);;
  }

  // @Post('/getloginlog')
  // @HttpCode(200)
  // logLoginLog(@Body() dto: GetLoginLogsDto): void {
  //   const query = new QueryRespone();
  //   //return this.authService.getLoginLog(dto);
  // }

  @Post('/getloginlog')
  @HttpCode(200)
  @UseGuards(AuthGuard())
  login1(@Body() dto: GetLoginLogsDto, @Req() req: Request): Promise<QueryRespone> {
    var userInfo: User = <User>req['user'];
    return this.authService.getLoginLog(dto,userInfo);
  }

}
