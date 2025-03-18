import {
    BadRequestException,
    Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import { Query } from 'express-serve-static-core';
import { CommandResponse } from 'src/shared/response/command.response';
import { FileInfo } from 'src/shared/schemas/File.schema';
import { UserRoles } from 'src/shared/constant/roles.constant';
import { QueryRespone } from 'src/shared/response/query.response';
import { User } from 'src/shared/schemas/user.schema';
import { TokenInfo } from 'src/shared/dto/token-info.dto';

@Injectable()
export class StorageService {
    constructor(
        @InjectModel(FileInfo.name)
        private fileModel: mongoose.Model<FileInfo>
    ) { }

    async UploadFile(file: Express.Multer.File, loginUserInfo: any, customerId: string): Promise<CommandResponse> {
        const response = new CommandResponse();
        if (!file) {
            throw new BadRequestException('File is required');
        }

        const fileModel = {
            _id: (file as any).FileId,
            FileName: file.filename,
            FileLocation: (file as any).FileLocation,
            FileSize: file.size,
            RolesAllowedToRead: [UserRoles.Admin],
            RolesAllowedToDelete: [UserRoles.Admin],
            IdsAllowedToRead: [loginUserInfo._id, customerId]
        }
        await this.fileModel.create(fileModel);
        response.setSuccess({FileId: fileModel._id})
        return response;
    }

    async GetFileInfo(fileId: string): Promise<FileInfo> {
        const fileInfo = this.fileModel.findOne({_id: fileId});
        return fileInfo;
    }

    async getAllDocs(query: Query, loggedInUserInfo: any): Promise<QueryRespone> {
        const response = new QueryRespone();
        const resPerPage = Number(query.size) ?? 2;
        const currentPage = Number(query.page) || 1;
        const skip = resPerPage * (currentPage - 1);
    
        const keyword = query.keyword
          ? {
            title: {
              $regex: query.keyword,
              $options: 'i',
            },
          }
          : {};

        let mongoQuery = {};
        if(loggedInUserInfo.Roles.indexOf(UserRoles.Customer) > -1) {
            mongoQuery = {IdsAllowedToRead: loggedInUserInfo._id};
        }
    
        const users = await this.fileModel
          .find(mongoQuery)
          .limit(resPerPage)
          .skip(skip);
        const usersCount = await this.fileModel
          .countDocuments(mongoQuery);
    
        const responseUsers = [];
        users.forEach(x => {
          responseUsers.push({
            ItemId: x._id,
            FileName: x.FileName,
            FileSize: x.FileSize,
          });
        });
    
        response.setData(responseUsers, usersCount);
        return response;
      }

      async getAllDocsByUser(query: Query, userId: string): Promise<QueryRespone> {
        const response = new QueryRespone();
        const resPerPage = Number(query.size) ?? 2;
        const currentPage = Number(query.page) || 1;
        const skip = resPerPage * (currentPage - 1);
    

        let mongoQuery = {IdsAllowedToRead: userId ? userId: ''};
    
        const users = await this.fileModel
          .find(mongoQuery)
          .limit(resPerPage)
          .skip(skip);
        const usersCount = await this.fileModel
          .countDocuments(mongoQuery);
    
        const responseUsers = [];
        users.forEach(x => {
          responseUsers.push({
            ItemId: x._id,
            FileName: x.FileName,
            FileSize: x.FileSize,
          });
        });
    
        response.setData(responseUsers, usersCount);
        return response;
      }

      async DeleteDocument(fileId: string): Promise<boolean> {
        let mongoQuery = {_id : fileId ? fileId : '' };
        const file = await this.fileModel
          .deleteOne(mongoQuery);
    
        return true;
      }

}
