import { IsInt, Min } from 'class-validator';

export class SaveProgressDto {
  @IsInt()
  @Min(0)
  position!: number;
}
