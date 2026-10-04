import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { Role } from '@prisma/client';

// DTO = mô tả dữ liệu đầu vào. ValidationPipe tự kiểm tra và trả lỗi 400 nếu sai
export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsIn(['ADMIN', 'AGENT'])
  role?: Role;
}
