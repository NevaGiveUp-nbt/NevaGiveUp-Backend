import { Type } from "class-transformer";
import { ArrayNotEmpty, ArrayUnique, IsArray, IsInt, IsString } from "class-validator";

export class ReorderSectionsDto {
  @IsString()
  courseId!: string; // khóa học của bạn dùng id kiểu string (giống prop courseId ở FE)

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  sectionIds!: number[];
}