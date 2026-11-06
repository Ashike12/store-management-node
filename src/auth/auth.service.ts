import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { SignUpDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { SharedService } from './../services/shared.service';
import { RefreshDto } from './dto/RefreshDto';
import { RedisHelperService } from '../services/redis-helper.service';
import { User } from '../shared/schemas/user.schema';
import { CommandResponse } from '../shared/response/command.response';
import { SetPasswordDto } from './dto/set-password.dto';
import { AnnonymousTokenInfo, TokenInfo } from '../shared/dto/token-info.dto';
import { UserRoles } from '../shared/constant/roles.constant';
import { UserLoginLog } from '../shared/schemas/userloginlog.schema';
import { GetLoginLogResponseDto } from './dto/getloginlog.response.dto';
import { QueryRespone } from '../shared/response/query.response';
import { GetLoginLogsDto } from './dto/getloginlog.dto';
import { ClientSignUpDto } from './dto/client-signup.dto';
import { ClientGoogleAuthDto } from './dto/client-google-auth.dto';
import { GoogleIdentityService } from './google-identity.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name)
    private userModel: Model<User>,
    private jwtService: JwtService,
    @InjectModel(UserLoginLog.name)
    private UserLoginLogModel: Model<UserLoginLog>,
    private sharedService: SharedService,
    private redisClient: RedisHelperService,
    private googleIdentity: GoogleIdentityService,
  ) {}

  async signUp(signUpDto: SignUpDto): Promise<boolean> {
    const { FirstName, LastName, DisplayName, Email, Password, Phone } =
      signUpDto;
    const hashedPassword = await bcrypt.hash(Password, 10);
    const displayName =
      DisplayName == null || DisplayName == ''
        ? FirstName + ' ' + LastName
        : DisplayName;
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
      RolesAllowedToWrite: ['admin'],
    });

    return true;
  }

  async clientSignUp(
    dto: ClientSignUpDto,
  ): Promise<{ login_token: string; refresh_token: string }> {
    const Email = dto.Email.trim().toLowerCase();
    if (await this.userModel.exists({ Email })) {
      throw new ConflictException('Email already exists');
    }

    const DisplayName = `${dto.FirstName.trim()} ${dto.LastName.trim()}`;
    await this.userModel.create({
      _id: this.sharedService.getUid(),
      FirstName: dto.FirstName.trim(),
      LastName: dto.LastName.trim(),
      DisplayName,
      Email,
      Password: await bcrypt.hash(dto.Password, 10),
      AuthProviders: ['password'],
      Active: true,
      Roles: [UserRoles.Customer, UserRoles.AppUser],
      RolesAllowedToRead: [UserRoles.Admin],
      RolesAllowedToUpdate: [UserRoles.Admin],
      RolesAllowedToWrite: [UserRoles.Admin],
      CreatedDate: new Date().toISOString(),
    });

    return this.login({
      Email,
      Password: dto.Password,
      GrantType: 'password',
    });
  }

  async clientGoogleAuth(
    dto: ClientGoogleAuthDto,
  ): Promise<{ login_token: string; refresh_token: string }> {
    const identity = await this.googleIdentity.verifyCredential(dto.Credential);
    let user = await this.userModel.findOne({ Email: identity.email });

    if (user) {
      if (!user.Roles.includes(UserRoles.Customer)) {
        throw new ConflictException(
          'This email belongs to a non-customer account',
        );
      }
      if (!user.Active) {
        throw new UnauthorizedException('Inactive Customer');
      }
      if (user.GoogleSubject && user.GoogleSubject !== identity.subject) {
        throw new UnauthorizedException('Google account could not be verified');
      }

      if (
        user.GoogleSubject !== identity.subject ||
        !user.AuthProviders?.includes('google')
      ) {
        const updatedUser = await this.userModel.findByIdAndUpdate(
          user._id,
          {
            GoogleSubject: identity.subject,
            AuthProviders: Array.from(
              new Set([
                ...(user.AuthProviders?.length
                  ? user.AuthProviders
                  : user.Password
                    ? ['password']
                    : []),
                'google',
              ]),
            ),
          },
          { new: true, runValidators: true },
        );
        if (!updatedUser) {
          throw new UnauthorizedException('Customer account no longer exists');
        }
        user = updatedUser;
      }
    } else {
      user = await this.userModel.create({
        _id: this.sharedService.getUid(),
        FirstName: identity.firstName,
        LastName: identity.lastName,
        DisplayName: identity.displayName,
        Email: identity.email,
        Password: await bcrypt.hash(
          `${this.sharedService.getUid()}:${identity.subject}`,
          10,
        ),
        GoogleSubject: identity.subject,
        AuthProviders: ['google'],
        Active: true,
        Roles: [UserRoles.Customer, UserRoles.AppUser],
        RolesAllowedToRead: [UserRoles.Admin],
        RolesAllowedToUpdate: [UserRoles.Admin],
        RolesAllowedToWrite: [UserRoles.Admin],
        CreatedDate: new Date().toISOString(),
      });
    }

    return this.issueTokens(user);
  }

  async login(
    loginDto: LoginDto,
  ): Promise<{ login_token: string; refresh_token: string }> {
    const { Email, Password } = loginDto;

    const user = await this.userModel.findOne({ Email });
    if (!user) {
      throw new UnauthorizedException('Incorrect email or password');
    }
    console.log(user.Email);
    if (
      user &&
      (user.Roles.includes(UserRoles.Customer) ||
        user.Roles.includes(UserRoles.Employee)) &&
      !user.Active
    ) {
      throw new UnauthorizedException('Inactive Customer');
    }
    const isPasswordMatched = await bcrypt.compare(Password, user.Password);
    if (!isPasswordMatched) {
      throw new UnauthorizedException('password not matched');
    }
    return this.issueTokens(user);
  }

  private async issueTokens(
    user: User,
  ): Promise<{ login_token: string; refresh_token: string }> {
    const tokenMetaData: TokenInfo = {
      UserId: user._id,
      UserName: user.DisplayName,
      Roles: user.Roles,
    };
    const login_token = this.jwtService.sign(tokenMetaData);
    const refresh_token = this.sharedService.getUid();
    await this.redisClient.setWithExpiryInSecond(
      refresh_token,
      JSON.stringify(tokenMetaData),
      5000,
    );
    //write log to db
    await this.UserLoginLogModel.create({
      _id: this.sharedService.getUid(),
      UserId: user._id,
      DisplayName: user.DisplayName,
      LoginTime: new Date(),
    });

    return { login_token, refresh_token };
  }

  async getAnonymousToken(): Promise<{
    login_token: string;
    refresh_token: string;
  }> {
    const tokenMetaData: AnnonymousTokenInfo = {
      Roles: ['annonymous'],
    };
    const login_token = this.jwtService.sign(tokenMetaData);
    const refresh_token = this.sharedService.getUid();
    await this.redisClient.setWithExpiryInSecond(
      refresh_token,
      JSON.stringify(tokenMetaData),
      5000,
    );
    return { login_token, refresh_token };
  }

  private getTokenMetaData(user: User) {
    const tokenMetaData = {
      id: user._id,
      roles: user.Roles,
      email: user.Email,
      DisplayName: user.DisplayName,
    };
    return tokenMetaData;
  }

  async refresh(loginDto: RefreshDto): Promise<{ login_token: string }> {
    const { RefreshToken } = loginDto;
    const tokenInfo = await this.redisClient.get(RefreshToken);
    if (tokenInfo == null) {
      throw new UnauthorizedException(
        'Refresh token expired, login again to continue',
      );
    }
    const login_token = this.jwtService.sign(JSON.parse(tokenInfo));
    return { login_token };
  }

  async setPassword(dto: SetPasswordDto): Promise<CommandResponse> {
    const response = new CommandResponse();
    const userId = await this.redisClient.get(dto.ActivationId);
    if (userId == null || userId == '') {
      throw new UnauthorizedException('Activation id invalid');
    }
    const hashedPassword = await bcrypt.hash(dto.Password, 10);
    await this.userModel.findByIdAndUpdate(
      userId,
      { Password: hashedPassword },
      {
        new: true,
        runValidators: true,
      },
    );
    await this.redisClient.del(dto.ActivationId);
    return response;
  }

  async getLoginLog(
    dto: GetLoginLogsDto,
    userInfo: User,
  ): Promise<QueryRespone> {
    const response = new QueryRespone();
    let filter = {};
    if (userInfo.Roles.indexOf(UserRoles.WholeSaler)) {
      filter = { Roles: UserRoles.WholeSaler };
    }
    const loginLogs = await this.UserLoginLogModel.find(filter);
    const logoutputList: GetLoginLogResponseDto[] = [];
    loginLogs.forEach((log) => {
      logoutputList.push({
        DisplayName: log.DisplayName,
        LoginTime: log.LoginTime,
        UserId: log.UserId,
      });
    });
    response.setData(logoutputList, logoutputList.length);
    return response;
  }
}
