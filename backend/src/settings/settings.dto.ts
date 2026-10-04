import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateSettingsDto {
  /** Tắt = bot ngừng trả lời mọi kênh (mọi tin chờ nhân viên) */
  @IsOptional()
  @IsBoolean()
  botEnabled?: boolean;

  @IsOptional()
  @IsString()
  businessName?: string;

  @IsOptional()
  @IsString()
  businessDescription?: string;

  /** Hướng dẫn thêm cho bot: giọng điệu, điều cấm, khuyến mãi đang chạy... */
  @IsOptional()
  @IsString()
  instructions?: string;
}
