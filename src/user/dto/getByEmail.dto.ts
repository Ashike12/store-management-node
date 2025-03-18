import { IsEmail, IsNotEmpty } from "class-validator";

export class GetByEmailDto {
  @IsNotEmpty()
  @IsEmail({}, { message: 'Please enter correct email' })
  readonly Email: string;
}
