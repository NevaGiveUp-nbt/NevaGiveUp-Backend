import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
  Req,
  Body,
  Put,
} from '@nestjs/common';
import { LearningService } from './learning.service';
import { ResponseMessage } from '@/decorator/responseMessage.decorator';
import { CurrentUser } from '@/decorator/current-user.decorator';
import type { AuthUser } from '@/auth/interfaces/auth-user.interface';
import { QueryEnrolledCourseDto } from './dto/query-learning.dto';
import { SaveProgressDto } from './dto/save-progress.dto';

@Controller('learning')
export class LearningController {
  constructor(private readonly learningService: LearningService) {}

  // ─── API 1: Kiểm tra Enrollment Status ───
  @Get('courses/:courseId/enrollment-status')
  @ResponseMessage('Lấy trạng thái đăng ký thành công')
  async getEnrollmentStatus(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
  ) {
    return this.learningService.getEnrollmentStatus(user.id, courseId);
  }

  // ─── API 2: Danh sách Course đã Enroll ───
  @Get('my-courses')
  @ResponseMessage('Lấy danh sách khóa học đã đăng ký thành công')
  async getMyCourses(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryEnrolledCourseDto,
  ) {
    return this.learningService.getMyCourses(
      user.id,
      query.page ?? 1,
      query.limit ?? 10,
      query.status,
    );
  }

  // ─── API 3: Course Detail cho Learner ───
  @Get('courses/:slug')
  @ResponseMessage('Lấy thông tin khóa học cho học viên thành công')
  async getCourseForLearner(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
  ) {
    return this.learningService.getCourseForLearner(user.id, slug);
  }

  // ─── API 4: Curriculum / Lesson cho Learner (sidebar data) ───
  @Get('courses/:slug/curriculum')
  @ResponseMessage('Lấy nội dung chương trình học thành công')
  async getCurriculum(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
  ) {
    return this.learningService.getCurriculum(user.id, slug);
  }

  // ─── API 5: Lesson Content ───
  @Get('courses/:slug/lessons/:lessonId')
  @ResponseMessage('Lấy nội dung bài giảng thành công')
  async getLessonContent(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
    @Param('lessonId', ParseIntPipe) lessonId: number,
  ) {
    return this.learningService.getLessonContent(user.id, slug, lessonId);
  }

  // ─── API 6: Download Resource từ R2 ───
  @Get('lessons/:lessonId/resources/:resourceId/download')
  @ResponseMessage('Lấy link tải tài liệu thành công')
  async downloadResource(
    @CurrentUser() user: AuthUser,
    @Param('lessonId', ParseIntPipe) lessonId: number,
    @Param('resourceId', ParseIntPipe) resourceId: number,
  ) {
    return this.learningService.downloadResource(user.id, lessonId, resourceId);
  }

  // ─── API 7: Update Progress (recalculate) ───
  @Patch('courses/:courseId/progress')
  @ResponseMessage('Cập nhật tiến độ thành công')
  async updateProgress(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
  ) {
    return this.learningService.recalculateProgress(user.id, courseId);
  }

  // ─── API 8: Complete Lesson ───
  @Post('courses/:slug/lessons/:lessonId/complete')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Hoàn thành bài giảng thành công')
  async completeLesson(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
    @Param('lessonId', ParseIntPipe) lessonId: number,
  ) {
    return this.learningService.completeLesson(user.id, slug, lessonId);
  }

  // ─── API 9: UnComplete Lesson ───
  @Post('courses/:slug/lessons/:lessonId/uncomplete')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Bỏ hoàn thành bài giảng thành công')
  async unCompleteLesson(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
    @Param('lessonId', ParseIntPipe) lessonId: number,
  ) {
    return this.learningService.unCompleteLesson(user.id, slug, lessonId);
  }

  // ─── API 10: Save Lesson Progress ───
  @Put('courses/:slug/lessons/:lessonId/progress')
  @ResponseMessage('Cập nhật tiến độ bài giảng thành công')
  saveProgress(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
    @Param('lessonId', ParseIntPipe) lessonId: number,
    @Body() dto: SaveProgressDto,
  ) {
    return this.learningService.saveLessonProgress(
      user.id,
      slug,
      lessonId,
      dto.position,
    );
  }
}
