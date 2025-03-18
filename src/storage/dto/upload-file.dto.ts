import {
    IsEmail,
    IsNotEmpty,
    IsString,
  } from 'class-validator';
  
  export class CreateUserDto {
    @IsString()
    readonly FirstName: string;
  
    @IsString()
    readonly LastName: string;
  
    readonly DisplayName: string;
  
    @IsNotEmpty()
    @IsEmail({}, { message: 'Please enter correct email' })
    readonly Email: string;
  }
  