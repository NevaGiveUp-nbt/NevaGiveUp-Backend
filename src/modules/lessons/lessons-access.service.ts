import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CourseStatus, EnrollmentStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AuthorizationService } from '@/authorization/authorization.service';

@Injectable()
export class LessonAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async getLessonForAccess(lessonId: number) {
    const lesson = await this.prisma.lesson.findFirst({
      where: {
        id: lessonId,
        deletedAt: null,
        section: {
          deletedAt: null,
          course: {
            deletedAt: null,
          },
        },
      },
      select: {
        id: true,
        title: true,
        videoId: true,
        duration: true,
        content: true,
        order: true,
        isPreview: true,
        section: {
          select: {
            id: true,
            courseId: true,
          },
        },
      },
    });

    if (!lesson) {
      throw new NotFoundException('Không tìm thấy bài giảng');
    }

    return lesson;
  }

  async canAccessLesson(userId: string, lessonId: number): Promise<boolean> {
    const lesson = await this.getLessonForAccess(lessonId);

    if (lesson.isPreview) {
      return true;
    }

    const enrollment = await this.prisma.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId: lesson.section.courseId,
        },
      },
      select: {
        status: true,
      },
    });

    if (!enrollment) {
      return false;
    }

    return [
      EnrollmentStatus.ENROLLED,
      EnrollmentStatus.IN_PROGRESS,
      EnrollmentStatus.COMPLETED,
    ].includes(enrollment.status);
  }

  //Khẳng định quyền truy cập bài học
  async assertCanAccessLesson(userId: string, lessonId: number) {
    const lesson = await this.getLessonForAccess(lessonId);

    if (lesson.isPreview) {
      return lesson;
    }

    const enrollment = await this.prisma.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId: lesson.section.courseId,
        },
      },
      select: {
        status: true,
      },
    });

    const canAccess =
      enrollment &&
      [
        EnrollmentStatus.ENROLLED,
        EnrollmentStatus.IN_PROGRESS,
        EnrollmentStatus.COMPLETED,
      ].includes(enrollment.status);

    if (!canAccess) {
      throw new ForbiddenException(
        'Bạn phải đăng ký khóa học này để truy cập bài học',
      );
    }

    return lesson;
  }

  /**
   * Khẳng định quyền truy cập bài học (có bypass cho Admin/Instructor).
   * Trả về { lesson, isEnrolled, isPreviewOnly }
   */
  async assertCanAccessLessonWithBypass(userId: string, lessonId: number) {
    const lesson = await this.getLessonForAccess(lessonId);

    // Admin bypass
    const isAdmin = await this.authorizationService.hasRole(userId, 'ADMIN');
    if (isAdmin) {
      return { lesson, isEnrolled: true, isPreviewOnly: false };
    }

    // Instructor owner bypass
    const course = await this.prisma.course.findUnique({
      where: { id: lesson.section.courseId },
      select: { instructorId: true },
    });
    if (course && course.instructorId === userId) {
      return { lesson, isEnrolled: true, isPreviewOnly: false };
    }

    // Check enrollment
    const enrollment = await this.prisma.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId: lesson.section.courseId,
        },
      },
      select: { status: true },
    });

    const isEnrolled =
      !!enrollment &&
      [
        EnrollmentStatus.ENROLLED,
        EnrollmentStatus.IN_PROGRESS,
        EnrollmentStatus.COMPLETED,
      ].includes(enrollment.status);

    // Preview lesson → ai cũng xem được video/content, nhưng không tải resource
    if (lesson.isPreview) {
      return { lesson, isEnrolled, isPreviewOnly: !isEnrolled };
    }

    // Chưa enroll + không preview → cấm
    if (!isEnrolled) {
      throw new ForbiddenException(
        'Bạn phải đăng ký khóa học này để truy cập bài học',
      );
    }

    return { lesson, isEnrolled: true, isPreviewOnly: false };
  }

  /**
   * Kiểm tra enrollment tồn tại và active (dùng cho progress/completion flows).
   */
  async assertEnrollment(userId: string, courseId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: {
        userId_courseId: { userId, courseId },
      },
    });

    if (!enrollment) {
      throw new ForbiddenException('Bạn phải đăng ký khóa học này');
    }

    if (
      ![
        EnrollmentStatus.ENROLLED,
        EnrollmentStatus.IN_PROGRESS,
        EnrollmentStatus.COMPLETED,
      ].includes(enrollment.status)
    ) {
      throw new ForbiddenException('Trạng thái đăng ký không hợp lệ');
    }

    return enrollment;
  }

  //Khẳng định quyền tải tài nguyên của bài học
  async assertCanDownloadResource(userId: string, lessonId: number) {
    const lesson = await this.getLessonForAccess(lessonId);
    const isAdmin = await this.authorizationService.hasRole(userId, 'ADMIN');
    if (isAdmin) {
      return lesson;
    }
    if (lesson.isPreview) {
      throw new ForbiddenException(
        'Không thể tải tài nguyên của bài giảng cho phép xem trước',
      );
    }

    const enrollment = await this.prisma.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId: lesson.section.courseId,
        },
      },
      select: {
        status: true,
      },
    });

    const canDownload =
      enrollment &&
      [
        EnrollmentStatus.ENROLLED,
        EnrollmentStatus.IN_PROGRESS,
        EnrollmentStatus.COMPLETED,
      ].includes(enrollment.status);

    if (!canDownload) {
      throw new ForbiddenException(
        'Bạn phải đăng ký khóa học để tải tài nguyên',
      );
    }

    return lesson;
  }

  async assertLessonInEnrolledCourse(
    userId: string,
    slug: string,
    lessonId: number,
  ) {
    const course = await this.prisma.course.findFirst({
      where: {
        slug,
        status: { in: [CourseStatus.PUBLISHED, CourseStatus.UNPUBLISHED] },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!course) throw new NotFoundException('Không tìm thấy khóa học');

    await this.assertEnrollment(userId, course.id);

    const lesson = await this.prisma.lesson.findFirst({
      where: {
        id: lessonId,
        deletedAt: null,
        section: { deletedAt: null, courseId: course.id },
      },
      select: { id: true, duration: true },
    });
    if (!lesson)
      throw new NotFoundException(
        'Không tìm thấy bài giảng trong khóa học này',
      );

    return { course, lesson };
  }
}
