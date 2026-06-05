import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import { Query } from 'express-serve-static-core';
import { User } from '../shared/schemas/user.schema';
import { CommandResponse } from '../shared/response/command.response';
import { CreateUserDto } from './dto/create-user.dto';
import { SharedService } from '../services/shared.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryRespone } from '../shared/response/query.response';
import { RedisHelperService } from '../services/redis-helper.service';
import { UserRoles } from '../shared/constant/roles.constant';
import * as bcrypt from 'bcryptjs';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name)
    private userModel: mongoose.Model<User>,
    private sharedService: SharedService,
    private redisClient: RedisHelperService
  ) { }

  private readonly invitationExpiryDurationInDays = 10;

  async findAll(query: Query, loggedInUserInfo: User): Promise<QueryRespone> {
    const response = new QueryRespone();
    const resPerPage = Number(query.size) ?? 10;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);

    let mongoQuery: any = { Roles: UserRoles.WholeSaler };
    console.log(mongoQuery);
    const users = await this.userModel
      .find(mongoQuery)
      .limit(resPerPage)
      .skip(skip);
    const usersCount = await this.userModel
      .countDocuments(mongoQuery);

    const responseUsers = [];
    users.forEach(x => {
      responseUsers.push({
        ItemId: x._id,
        Email: x.Email || null,
        FirstName: x.FirstName || null,
        LastName: x.LastName || null,
        DisplayName: x.DisplayName || null,
        Phone: x.Phone || null,
        DateOfBirth: x.DateOfBirth || null,
        Address: x.Address,
        Active: x.Active,
        CreatedDate: x.CreatedDate
      });
    });

    response.setData(responseUsers, usersCount);
    return response;
  }

  async findByEmail(email: string, loggedInUserInfo: User): Promise<QueryRespone> {
    const response = new QueryRespone();
    const user = await this.userModel.findOne({ Email: email });

    if (!user) {
      throw new NotFoundException('User not found.');
    }
    response.setData({
      ItemId: user._id,
      Email: user.Email,
      FirsName: user.FirstName || null,
      LastName: user.LastName || null,
      DisplayName: user.DisplayName || null,
      DateOfBirth: user.DateOfBirth || null,
      NRIC: user.NRIC || null,
      Address: user.Address || null,
      Finance: user.Finance || null,
    }, 0);
    return response;
  }

  async findById(id: string): Promise<QueryRespone> {
    const response = new QueryRespone();
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    response.setData({
      ItemId: user._id,
      Email: user.Email,
      FirsName: user.FirstName || null,
      LastName: user.LastName || null,
      DisplayName: user.DisplayName || null,
      DateOfBirth: user.DateOfBirth || null,
      NRIC: user.NRIC || null,
      Address: user.Address || null,
      Finance: user.Finance || null,
    }, 0);
    return response;
  }

  async getCurrentUser(loggedInUserInfo: User): Promise<QueryRespone> {
    const response = new QueryRespone();
    const user = await this.userModel.findById(loggedInUserInfo._id);
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    response.setData({
      ItemId: user._id,
      Email: user.Email || '',
      FirstName: user.FirstName || '',
      LastName: user.LastName || '',
      DisplayName: user.DisplayName || '',
      Phone: user.Phone || '',
      DateOfBirth: user.DateOfBirth || null,
      Address: user.Address || '',
      Active: user.Active,
      CreatedDate: user.CreatedDate,
    }, 0);
    return response;
  }

  async createCustomer(dto: CreateUserDto, loggedInUserInfo: User): Promise<CommandResponse> {
    const response = new CommandResponse();
    const existingUserCount = await this.userModel.countDocuments({ Email: dto.Email });
    if (existingUserCount > 0) {
      throw new ConflictException('Email already exists');
    }
    const displayName = (dto.DisplayName == null || dto.DisplayName == "") ? (dto.FirstName + " " + dto.LastName) : dto.DisplayName;
    const hashedPassword = await bcrypt.hash(dto.Password, 10);
    const userModel = {
      _id: this.sharedService.getUid(),
      FirstName: dto.FirstName,
      LastName: dto.LastName,
      DisplayName: displayName,
      Email: dto.Email,
      Phone: dto.Phone,
      Password: hashedPassword,
      DateOfBirth: dto.DateOfBirth || null,
      Address: dto.Address || '',
      ActivationId: this.sharedService.getUid(),
      ActivationIdExpiry: this.sharedService.getFutureUtcDate(this.invitationExpiryDurationInDays),
      Active: false,
      Roles: [UserRoles.AppUser, UserRoles.Annonymous, UserRoles.WholeSaler],
      RolesAllowedToRead: [UserRoles.Admin],
      RolesAllowedToUpdate: [UserRoles.Admin],
      RolesAllowedToWrite: [UserRoles.Admin],
      CreatedDate: new Date().toISOString()
    }
    await this.userModel.create(userModel);
    await this.redisClient.setWithExpiryInSecond(userModel.ActivationId, userModel._id, this.invitationExpiryDurationInDays * 24 * 60 * 60);
    return response;
  }

  private createUpdateObject(userDto: UpdateUserDto): any {
    const updates = {};
    if (userDto.FirstName != null && userDto.FirstName != '') updates['FirstName'] = userDto.FirstName;
    if (userDto.LastName != null && userDto.LastName != '') updates['LastName'] = userDto.LastName;
    if (userDto.DisplayName != null && userDto.DisplayName != '') updates['DisplayName'] = userDto.DisplayName;
    if (userDto.Email != null && userDto.Email != '') updates['Email'] = userDto.Email;
    if (userDto.Phone != null && userDto.Phone != '') updates['Phone'] = userDto.Phone;
    if (userDto.DateOfBirth != null) updates['DateOfBirth'] = userDto.DateOfBirth;
    if (userDto.Address != null && userDto.Address != '') updates['Address'] = userDto.Address;
    if (userDto.Active != null) updates['Active'] = userDto.Active;
    return updates;
  }

  private createProfileUpdateObject(userDto: UpdateProfileDto): any {
    const updates = {};
    if (userDto.FirstName != null) updates['FirstName'] = userDto.FirstName;
    if (userDto.LastName != null) updates['LastName'] = userDto.LastName;
    if (userDto.DisplayName != null) updates['DisplayName'] = userDto.DisplayName;
    if (userDto.Phone != null) updates['Phone'] = userDto.Phone;
    if (userDto.Address != null) updates['Address'] = userDto.Address;
    if (userDto.DateOfBirth != null) updates['DateOfBirth'] = userDto.DateOfBirth;
    return updates;
  }

  async updateById(dto: UpdateUserDto, loggedInUserInfo: User): Promise<CommandResponse> {
    const response = new CommandResponse();
    const existingUser = await this.userModel.findOne({ _id: dto.ItemId });
    if (!existingUser) {
      throw new BadRequestException('User not found');
    }
    if (loggedInUserInfo.Roles.indexOf(UserRoles.Admin)) {

      const updateModel = this.createUpdateObject(dto);
      if (dto.Password != null) {
        const hashedPassword = await bcrypt.hash(dto.Password, 10);
        updateModel['Password'] = hashedPassword;
      }

      await this.userModel.findByIdAndUpdate(dto.ItemId, updateModel, {
        new: true,
        runValidators: true,
      });
      return response;
    }
    else {
      throw new UnauthorizedException('Permission Denied');
    }
  }

  async updateCurrentUser(dto: UpdateProfileDto, loggedInUserInfo: User): Promise<CommandResponse> {
    const response = new CommandResponse();
    const existingUser = await this.userModel.findOne({ _id: loggedInUserInfo._id });
    if (!existingUser) {
      throw new BadRequestException('User not found');
    }

    const updateModel = this.createProfileUpdateObject(dto);
    await this.userModel.findByIdAndUpdate(loggedInUserInfo._id, updateModel, {
      new: true,
      runValidators: true,
    });

    return response;
  }

  async changePassword(dto: ChangePasswordDto, loggedInUserInfo: User): Promise<CommandResponse> {
    const response = new CommandResponse();
    const existingUser = await this.userModel.findOne({ _id: loggedInUserInfo._id });
    if (!existingUser) {
      throw new BadRequestException('User not found');
    }

    const isPasswordMatched = await bcrypt.compare(dto.CurrentPassword, existingUser.Password);
    if (!isPasswordMatched) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const isSamePassword = await bcrypt.compare(dto.NewPassword, existingUser.Password);
    if (isSamePassword) {
      throw new BadRequestException('New password must be different from current password');
    }

    const hashedPassword = await bcrypt.hash(dto.NewPassword, 10);
    await this.userModel.findByIdAndUpdate(loggedInUserInfo._id, { Password: hashedPassword }, {
      new: true,
      runValidators: true,
    });

    return response;
  }

  async deleteById(id: string, loggedInUserInfo: User): Promise<CommandResponse> {
    const response = new CommandResponse();
    const existingUser = await this.userModel.findOne({ _id: id });
    if (!existingUser) {
      throw new BadRequestException('User not found');
    }
    if (loggedInUserInfo.Roles.indexOf(UserRoles.Admin)) {
      await this.userModel.findByIdAndDelete(id);
      return response;
    }
    else {
      throw new UnauthorizedException('Permission Denied');
    }
  }
}
