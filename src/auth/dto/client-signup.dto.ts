import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ClientSignUpDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  FirstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  LastName: string;

  @IsEmail({}, { message: 'Please enter correct email' })
  @MaxLength(120)
  Email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  Password: string;
}
