import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { EnrollmentService } from './enrollment.service';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { UpdateEnrollmentDto } from './dto/update-enrollment.dto';
import type { AuthUser } from '@/auth/interfaces/auth-user.interface';
import { CurrentUser } from '@/decorator/current-user.decorator';

@Controller('enrollment')
export class EnrollmentController {
  constructor(private readonly enrollmentService: EnrollmentService) { }

  // @Post()
  // create(@Body() createEnrollmentDto: CreateEnrollmentDto) {
  //   return this.enrollmentService.create(createEnrollmentDto);
  // }

  // @Get()
  // findAll() {
  //   return this.enrollmentService.findAll();
  // }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.enrollmentService.findOne(+id);
  // }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updateEnrollmentDto: UpdateEnrollmentDto) {
  //   return this.enrollmentService.update(+id, updateEnrollmentDto);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.enrollmentService.remove(+id);
  // }

  @Post("course/:slug")
  async enrollFreeCourse(@CurrentUser() user: AuthUser, @Param('slug') slug: string){
      return this.enrollmentService.enrollFreeCourse(user.id, slug);
  }
}
