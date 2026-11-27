import { Type } from 'class-transformer';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsInt } from 'class-validator';

export class ReorderLessonsDto {
  @Type(() => Number)
  @IsInt()
  sectionId!: number;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  lessonIds!: number[]; // ID các bài theo thứ tự mới
}