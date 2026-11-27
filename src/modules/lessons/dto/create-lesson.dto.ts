import {
  IsString,
  IsInt,
  IsBoolean,
  IsOptional,
  Min,
  IsUrl,
  Matches,
  MaxLength,
  Length,
  ValidateIf,
  IsNotEmpty,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { IsMaxImages } from '@/decorator/max-images.decorator';

export class CreateLessonDto {
  @IsString()
  @MaxLength(255, { message: 'Tiêu đề không được vượt quá 255 ký tự' })
  @Length(1, 255, { message: 'Tiêu đề không được để trống' })
  title!: string;

  @IsOptional()
  @IsString()
  @IsMaxImages()
  content?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  order?: number;

  @Transform(({ obj, value }) => {
    if (obj.isPreview === undefined) return value;
    return obj.isPreview === 'true' || obj.isPreview === true;
  })
  @IsBoolean()
  isPreview!: boolean;

  @IsInt()
  @Min(1, { message: 'ID của Chương không được để trống' })
  sectionId!: number;
}
