import { BadRequestException } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

const splitQueryValues = (value: unknown, field: string) => {
  if (value === undefined || value === null || value === '') return undefined;

  const values: unknown[] = Array.isArray(value) ? value : [value];
  return values
    .flatMap((item) => {
      if (typeof item !== 'string' && typeof item !== 'number') {
        throw new BadRequestException(`${field} chỉ chấp nhận chuỗi hoặc số`);
      }

      return String(item).split(',');
    })
    .map((item) => item.trim())
    .filter(Boolean);
};

export class QueryCourseDto {
  @Type(() => Number)
  @IsOptional()
  @IsNumber({}, { message: 'page phải là số' })
  page?: number = 1;

  @Type(() => Number)
  @IsOptional()
  @IsNumber({}, { message: 'limit phải là số' })
  limit?: number = 10;

  @IsOptional()
  @IsIn(
    [
      'createdAt',
      'price',
      'discount',
      'studentCount',
      'averageRating',
      'title',
    ],
    {
      message: 'sortBy không hợp lệ',
    },
  )
  sortBy?:
    | 'createdAt'
    | 'price'
    | 'discount'
    | 'studentCount'
    | 'averageRating'
    | 'title' = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'sortOrder phải là asc hoặc desc' })
  sortOrder?: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsString({ message: 'search phải là chuỗi' })
  search?: string;

  @Transform(({ value, key }) => splitQueryValues(value, key))
  @IsOptional()
  level?: string[];

  @Transform(({ value, key }) => splitQueryValues(value, key))
  @IsOptional()
  courseType?: string[];

  @Transform(({ value, key }) => splitQueryValues(value, key))
  @IsOptional()
  tag?: number[];

  @Type(() => Number)
  @IsOptional()
  @IsNumber({}, { message: 'rating phải là số' })
  rating?: number;
}
