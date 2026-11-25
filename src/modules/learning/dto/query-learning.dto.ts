import { IsEnum, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { EnrollmentStatus } from '@prisma/client';
export class QueryEnrolledCourseDto {
  @Type(() => Number)
  @IsOptional()
  @IsNumber({}, { message: 'page phải là số' })
  page?: number = 1;

  @Type(() => Number)
  @IsOptional()
  @IsNumber({}, { message: 'limit phải là số' })
  limit?: number = 10;

  @IsOptional()
  @IsEnum(EnrollmentStatus, {
    message: 'Trạng thái phải thuộc: ENROLLED, IN_PROGRESS, COMPLETED',
  })
  status?: EnrollmentStatus = EnrollmentStatus.ENROLLED;
}
