import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { KnowledgeService } from './knowledge.service';

class CreateDocumentDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  content!: string;
}

class SearchDto {
  @IsString()
  query!: string;
}

@ApiTags('knowledge')
@ApiBearerAuth()
@Controller('api/knowledge')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get()
  list() {
    return this.knowledge.list();
  }

  // Thêm tài liệu dạng văn bản: FAQ, bảng giá, chính sách...
  @Post()
  create(@Body() dto: CreateDocumentDto) {
    return this.knowledge.addDocument(dto.title.trim(), dto.content);
  }

  // Upload file .txt / .md (multipart/form-data, field "file")
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Thiếu file');
    if (!/\.(txt|md)$/i.test(file.originalname)) {
      throw new BadRequestException('Hiện chỉ hỗ trợ .txt và .md');
    }
    const title = Buffer.from(file.originalname, 'latin1').toString('utf8'); // giữ đúng tên tiếng Việt
    return this.knowledge.addDocument(title, file.buffer.toString('utf8'));
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.knowledge.remove(id);
  }

  // Kiểm tra RAG: gõ câu hỏi, xem hệ thống tìm ra đoạn kiến thức nào
  @Post('search')
  @HttpCode(200)
  search(@Body() dto: SearchDto) {
    return this.knowledge.search(dto.query);
  }
}
