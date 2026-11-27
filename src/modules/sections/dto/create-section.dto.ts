import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateSectionDto {
  @IsString({ message: 'Tiêu đề không hợp lệ' })
  @IsNotEmpty({ message: 'Tiêu đề không được để trống' })
  title!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  order?: number;

  @IsString({ message: 'Mã khóa học không hợp lệ' })
  @IsNotEmpty({ message: 'Mã khóa học không được để trống' })
  courseId!: string;
}
