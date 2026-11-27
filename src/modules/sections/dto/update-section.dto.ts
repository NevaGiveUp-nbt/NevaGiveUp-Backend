import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { CreateSectionDto } from './create-section.dto';
import { OmitType, PartialType } from '@nestjs/mapped-types';

export class UpdateSectionDto extends PartialType(OmitType(CreateSectionDto,['order'] as const )) {}
