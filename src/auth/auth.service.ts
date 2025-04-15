import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConflictException } from '@nestjs/common';
import { Model } from 'mongoose';

import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { SignUpDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { SharedService } from './../services/shared.service';
import { RefreshDto } from './dto/RefreshDto';
import { RedisHelperService } from 'src/services/redis-helper.service';
import { User } from 'src/shared/schemas/user.schema';
import { CommandResponse } from 'src/shared/response/command.response';
import { SetPasswordDto } from './dto/set-password.dto';
import { AnnonymousTokenInfo, TokenInfo } from 'src/shared/dto/token-info.dto';
import { UserRoles } from 'src/shared/constant/roles.constant';
import { UserLoginLog } from 'src/shared/schemas/userloginlog.schema';
import { GetLoginLogResponseDto } from './dto/getloginlog.response.dto';
import { QueryRespone } from 'src/shared/response/query.response';
import { GetLoginLogsDto } from './dto/getloginlog.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name)
    private userModel: Model<User>,
    private jwtService: JwtService,
    @InjectModel(UserLoginLog.name)
    private UserLoginLogModel: Model<UserLoginLog>,
    private sharedService: SharedService,
    private redisClient: RedisHelperService
  ) { }

  async signUp(signUpDto: SignUpDto): Promise<boolean> {
    const { FirstName, LastName, DisplayName, Email, Password, Phone } = signUpDto;
    const hashedPassword = await bcrypt.hash(Password, 10);
    const displayName = (DisplayName == null || DisplayName == "") ? (FirstName + " " + LastName) : DisplayName;
    const existingUserCount = await this.userModel.countDocuments({ Email });
    if (existingUserCount > 0) {
      throw new ConflictException('Email already exists');
    }
    await this.userModel.create({
      _id: this.sharedService.getUid(),
      FirstName,
      LastName,
      DisplayName: displayName,
      Email,
      Phone,
      DateOfBirth: signUpDto.DateOfBirth,
      Address: signUpDto.Address,
      Finance: signUpDto.Finance,
      Password: hashedPassword,
      Active: true,
      Roles: [UserRoles.Annonymous, UserRoles.WholeSaler, UserRoles.AppUser],
      RolesAllowedToRead: ['admin'],
      RolesAllowedToUpdate: ['admin'],
      RolesAllowedToWrite: ['admin']
    });

    return true;
  }

  async login(loginDto: LoginDto): Promise<{ login_token: string, refresh_token: string }> {
    const { Email, Password } = loginDto;

    const user = await this.userModel.findOne({ Email });
    console.log(user.Email)
    if (!user) {
      throw new UnauthorizedException('Incorrect email or password');
    }
    if (user && user.Roles.indexOf(UserRoles.Customer) > -1 && !user.Active) {
      throw new UnauthorizedException('Inactive Customer');
    }
    const isPasswordMatched = await bcrypt.compare(Password, user.Password);
    if (!isPasswordMatched) {
      throw new UnauthorizedException('password not matched');
    }
    const tokenMetaData: TokenInfo = {
      UserId: user._id,
      UserName: user.DisplayName,
      Roles: user.Roles
    };
    const login_token = this.jwtService.sign(tokenMetaData);
    const refresh_token = this.sharedService.getUid();
    await this.redisClient.setWithExpiryInSecond(refresh_token, JSON.stringify(tokenMetaData), 5000);
    //write log to db
    await this.UserLoginLogModel.create({
      _id: this.sharedService.getUid(),
      UserId: user._id,
      DisplayName: user.DisplayName,
      LoginTime: new Date()
    })

    return { login_token, refresh_token };
  }

  async getAnonymousToken(): Promise<{ login_token: string, refresh_token: string }> {
    const tokenMetaData: AnnonymousTokenInfo = {
      Roles: ['annonymous']
    };
    const login_token = this.jwtService.sign(tokenMetaData);
    const refresh_token = this.sharedService.getUid();
    await this.redisClient.setWithExpiryInSecond(refresh_token, JSON.stringify(tokenMetaData), 5000);
    return { login_token, refresh_token };
  }

  private getTokenMetaData(user: User) {
    const tokenMetaData = { id: user._id, roles: user.Roles, email: user.Email, DisplayName: user.DisplayName };
    return tokenMetaData;
  }

  async refresh(loginDto: RefreshDto): Promise<{ login_token: string }> {
    const { RefreshToken } = loginDto;
    const tokenInfo = await this.redisClient.get(RefreshToken);
    if (tokenInfo == null) {
      throw new UnauthorizedException('Refresh token expired, login again to continue');
    }
    const login_token = this.jwtService.sign(JSON.parse(tokenInfo));
    return { login_token };
  }

  async setPassword(dto: SetPasswordDto): Promise<CommandResponse> {
    const response = new CommandResponse();
    const userId = (await this.redisClient.get(dto.ActivationId));
    if (userId == null || userId == '') {
      throw new UnauthorizedException('Activation id invalid');
    }
    const hashedPassword = await bcrypt.hash(dto.Password, 10);
    await this.userModel.findByIdAndUpdate(userId, { Password: hashedPassword }, {
      new: true,
      runValidators: true,
    });
    await this.redisClient.del(dto.ActivationId)
    return response;
  }


  async getLoginLog(dto: GetLoginLogsDto, userInfo: User): Promise<QueryRespone> {
    const response = new QueryRespone();
    let filter = {};
    if(userInfo.Roles.indexOf(UserRoles.WholeSaler)){
      filter = {Roles: UserRoles.WholeSaler};
    }
    const loginLogs = await this.UserLoginLogModel.find(filter);
    const logoutputList: GetLoginLogResponseDto[] = [];
    loginLogs.forEach(log => {
      logoutputList.push({
        DisplayName: log.DisplayName,
        LoginTime: log.LoginTime,
        UserId: log.UserId
      })
    })
    response.setData(logoutputList, logoutputList.length);
    return response;
  }

}
