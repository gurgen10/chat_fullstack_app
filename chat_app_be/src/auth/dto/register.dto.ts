import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(3)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'username can only contain letters, numbers, and underscores',
  })
  username!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(2)
  displayName!: string;
}
