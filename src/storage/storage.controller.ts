import { Controller, Post, UploadedFile, UseInterceptors, HttpException, HttpStatus, Logger, Get, Param, Res, UseGuards, HttpCode, Req, Query, StreamableFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { Query as ExpressQuery } from 'express-serve-static-core';
import { Response, Request } from 'express';
import { createReadStream, existsSync, mkdirSync, unlink } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { StorageService } from './storage.service';
import { CommandResponse } from '../shared/response/command.response';
import { AuthGuard } from '@nestjs/passport';
import { QueryRespone } from '../shared/response/query.response';
import * as path from 'path';

const fileStorageBasePath = process.env.SRORAGE_LOCATION;

@Controller('storage')
export class StorageController {
    
    constructor(private storageService: StorageService) { }

    @Post('uploadFile')
    @HttpCode(200)
    @UseGuards(AuthGuard())
    @UseInterceptors(FileInterceptor('file', {
        storage: diskStorage({
            destination: async(req, file, cb) => {
                const guid = uuidv4();
                const uploadPath = `${process.env.SRORAGE_LOCATION}${guid}/`;
                Logger.log(`Attempting to save file to ${uploadPath}`);

                if (!existsSync(uploadPath)) {
                    Logger.log(`Directory does not exist. Creating ${uploadPath}`);
                    mkdirSync(uploadPath, { recursive: true });
                  }
                file['FileId'] = guid;
                file['FileLocation'] = uploadPath;
                cb(null, uploadPath);
            },
            filename: (req, file, cb) => {
                const fileName = file.originalname;
                cb(null, fileName);
            },
        }),
    }))
    async uploadFile(@UploadedFile() file: Express.Multer.File,
    @Req() req: Request): Promise<CommandResponse> {
        var userInfo = req['user'];
        var customerId = req.body['customerId'];
        return this.storageService.UploadFile(file, userInfo, customerId);
    }

    @Get('getFiles')
    @HttpCode(200)
    @UseGuards(AuthGuard())
    async GetAllFilesInfo(@Query() query: ExpressQuery, @Req() req: Request): Promise<QueryRespone> {
      var userInfo = req['user'];
      return this.storageService.getAllDocs(query, userInfo);
    }

    @Get('getFilesByUser/:userId')
    @HttpCode(200)
   //@UseGuards(AuthGuard())
    async GetFilesInfoByUser(@Query() query: ExpressQuery, @Req() req: Request): Promise<QueryRespone> {
      var userInfo = req['user'];
      var userId = req.params['userId'];
      return this.storageService.getAllDocsByUser(query, userId);
    }


    @Get('getFile/:fileId')
    @HttpCode(200)
    //@UseGuards(AuthGuard())
    async downloadFile(@Param('fileId') fileId: string, @Res() res: Response) {
      // Find file info in the database
      const fileInfo = await this.storageService.GetFileInfo(fileId);
      if (!fileInfo) {
        throw new HttpException('File not found', HttpStatus.NOT_FOUND);
      }
  
      const filePath = fileInfo.FileLocation+"/"+fileInfo.FileName;
  
      // Check if file exists
      if (!existsSync(filePath)) {
        throw new HttpException('File not found on server', HttpStatus.NOT_FOUND);
      }
  
      // Send the file to the client
      console.log(filePath);
      res.download(filePath);
    }



    @Get('deleteFile/:fileId')
    @HttpCode(200)
    //@UseGuards(AuthGuard())
    async deleteFile(@Param('fileId') fileId: string, 
    @Res() res: Response) {
      // Find file info in the database
      const fileInfo = await this.storageService.GetFileInfo(fileId);
      if (!fileInfo) {
        throw new HttpException('File not found', HttpStatus.NOT_FOUND);
      }
  
      //const filePath = fileInfo.FileLocation+"/"+fileInfo.FileName;
  
      // // Check if file exists
      // if (!existsSync(filePath)) {
      //   throw new HttpException('File not found on server', HttpStatus.NOT_FOUND);
      // }
  
      // console.log('Delete', filePath);
      // unlink(filePath, err => {
      //   console.log(err);
      //   throw new HttpException('Error Deleting File', HttpStatus.EXPECTATION_FAILED);
      // });

      const response = await this.storageService.DeleteDocument(fileId);
      return res.send(true);
    }


}
