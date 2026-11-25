import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { StorageService } from '@/storage/storage.service';
import { LessonAccessService } from '@/modules/lessons/lessons-access.service';
import { AuthorizationService } from '@/authorization/authorization.service';
import { CourseStatus, EnrollmentStatus } from '@prisma/client';

@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly lessonAccessService: LessonAccessService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  // ═══════════════════════════════════════════════════════
  //  API 1: Kiểm tra Enrollment Status
  // ═══════════════════════════════════════════════════════
  async getEnrollmentStatus(userId: string, courseId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: {
        userId_courseId: { userId, courseId },
      },
      select: {
        status: true,
        progress: true,
        createdAt: true,
      },
    });

    if (!enrollment) {
      return {
        isEnrolled: false,
        status: null,
        progress: 0,
        enrolledAt: null,
      };
    }

    return {
      isEnrolled: true,
      status: enrollment.status,
      progress: enrollment.progress,
      enrolledAt: enrollment.createdAt,
    };
  }

  // ═══════════════════════════════════════════════════════
  //  API 2: Danh sách Course đã Enroll (My Courses)
  // ═══════════════════════════════════════════════════════
  async getMyCourses(
    userId: string,
    page: number,
    limit: number,
    status?: EnrollmentStatus,
  ) {
    const where: any = { userId };

    if (status) {
      where.status = status;
    }

    const [enrollments, totalItems] = await Promise.all([
      this.prisma.enrollment.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          status: true,
          progress: true,
          createdAt: true,
          updatedAt: true,
          course: {
            select: {
              id: true,
              title: true,
              slug: true,
              thumbnail: true,
              courseType: true,
              level: true,
              instructor: {
                select: {
                  id: true,
                  name: true,
                  avatar: true,
                },
              },
              sections: {
                where: { deletedAt: null },
                select: {
                  lessons: {
                    where: { deletedAt: null },
                    select: { id: true },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.enrollment.count({ where }),
    ]);

    // Lấy danh sách lessonId đã hoàn thành của user cho tất cả course
    const courseIds = enrollments.map((e) => e.course.id);
    const completedLessons = await this.prisma.lessonProgress.findMany({
      where: {
        userId,
        isCompleted: true,
        lesson: {
          deletedAt: null,
          section: {
            deletedAt: null,
            courseId: { in: courseIds },
          },
        },
      },
      select: {
        lessonId: true,
        lesson: {
          select: {
            section: {
              select: { courseId: true },
            },
          },
        },
      },
    });

    // Group completed lessons by courseId
    const completedByCourse = new Map<string, number>();
    for (const lp of completedLessons) {
      const cId = lp.lesson.section.courseId;
      completedByCourse.set(cId, (completedByCourse.get(cId) || 0) + 1);
    }

    const courses = enrollments.map((enrollment) => {
      const totalLessons = enrollment.course.sections.reduce(
        (sum, section) => sum + section.lessons.length,
        0,
      );

      return {
        courseId: enrollment.course.id,
        title: enrollment.course.title,
        slug: enrollment.course.slug,
        thumbnail: enrollment.course.thumbnail,
        level: enrollment.course.level,
        courseType: enrollment.course.courseType,
        instructor: enrollment.course.instructor,
        enrollmentStatus: enrollment.status,
        progress: enrollment.progress,
        enrolledAt: enrollment.createdAt,
        totalLessons,
        completedLessons: completedByCourse.get(enrollment.course.id) || 0,
      };
    });

    return {
      courses,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    };
  }

  // ═══════════════════════════════════════════════════════
  //  API 3: Course Detail cho Learner
  // ═══════════════════════════════════════════════════════
  async getCourseForLearner(userId: string, slug: string) {
    const course = await this.prisma.course.findFirst({
      where: {
        slug,
        status: { in: [CourseStatus.PUBLISHED, CourseStatus.UNPUBLISHED] },
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        slug: true,
        thumbnail: true,
        courseType: true,
        level: true,
        instructor: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        category: {
          select: {
            name: true,
          },
        },
        sections: {
          where: { deletedAt: null },
          orderBy: { order: 'asc' },
          select: {
            id: true,
            title: true,
            order: true,
            lessons: {
              where: { deletedAt: null },
              orderBy: { order: 'asc' },
              select: {
                id: true,
                title: true,
                duration: true,
                order: true,
                isPreview: true,
              },
            },
          },
        },
      },
    });

    if (!course) {
      throw new NotFoundException('Không tìm thấy khóa học');
    }

    // Kiểm tra enrollment — bắt buộc phải đã enroll
    const enrollment = await this.prisma.enrollment.findUnique({
      where: {
        userId_courseId: { userId, courseId: course.id },
      },
      select: {
        status: true,
        progress: true,
        createdAt: true,
      },
    });

    if (!enrollment) {
      throw new ForbiddenException('Bạn phải đăng ký khóa học này để truy cập');
    }

    // Lấy progress cho từng lesson
    const completedLessonIds = await this.prisma.lessonProgress.findMany({
      where: {
        userId,
        isCompleted: true,
        lesson: {
          deletedAt: null,
          section: {
            deletedAt: null,
            courseId: course.id,
          },
        },
      },
      select: { lessonId: true },
    });
    //Set O(1) nếu dùng array.include thì sẽ là O(n)
    const completedSet = new Set(completedLessonIds.map((lp) => lp.lessonId));

    const sections = course.sections.map((section) => ({
      id: section.id,
      title: section.title,
      order: section.order,
      lessons: section.lessons.map((lesson) => ({
        ...lesson,
        isCompleted: completedSet.has(lesson.id),
      })),
    }));

    //cộng dồn số lesson đã hoàn thành (ví dụ 7/10)
    const totalLessons = sections.reduce(
      (sum, s) => sum + s.lessons.filter((l) => l.isCompleted).length,
      0,
    );
    const completedLessons = completedSet.size;

    return {
      course: {
        id: course.id,
        title: course.title,
        slug: course.slug,
        thumbnail: course.thumbnail,
        courseType: course.courseType,
        level: course.level,
        instructor: course.instructor,
        category: course.category.name,
      },
      enrollment: {
        status: enrollment.status,
        progress: enrollment.progress,
        enrolledAt: enrollment.createdAt,
      },
      sections,
      totalLessons,
      completedLessons,
    };
  }

  // ═══════════════════════════════════════════════════════
  //  API 4: Curriculum / Lesson cho Learner (sidebar)
  // ═══════════════════════════════════════════════════════
  async getCurriculum(userId: string, slug: string) {
    const course = await this.prisma.course.findFirst({
      where: {
        slug,
        status: { in: [CourseStatus.PUBLISHED, CourseStatus.UNPUBLISHED] },
        deletedAt: null,
      },
      select: {
        id: true,
        sections: {
          where: { deletedAt: null },
          orderBy: { order: 'asc' },
          select: {
            id: true,
            title: true,
            order: true,
            lessons: {
              where: { deletedAt: null },
              orderBy: { order: 'asc' },
              select: {
                id: true,
                title: true,
                duration: true,
                order: true,
                isPreview: true,
                _count: {
                  select: { resources: true },
                },
              },
            },
          },
        },
      },
    });

    if (!course) {
      throw new NotFoundException('Không tìm thấy khóa học');
    }

    // Kiểm tra enrollment
    const enrollment = await this.lessonAccessService.assertEnrollment(
      userId,
      course.id,
    );

    // Lấy danh sách lesson đã hoàn thành
    const completedLessonIds = await this.prisma.lessonProgress.findMany({
      where: {
        userId,
        isCompleted: true,
        lesson: {
          deletedAt: null,
          section: {
            deletedAt: null,
            courseId: course.id,
          },
        },
      },
      select: { lessonId: true },
    });

    const completedSet = new Set(completedLessonIds.map((lp) => lp.lessonId));

    const sections = course.sections.map((section) => ({
      id: section.id,
      title: section.title,
      order: section.order,
      lessons: section.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        duration: lesson.duration,
        order: lesson.order,
        isPreview: lesson.isPreview,
        resourceCount: lesson._count.resources,
        isCompleted: completedSet.has(lesson.id),
      })),
    }));

    const validLessonIds = new Set(
      sections.flatMap((s) => s.lessons.map((l) => l.id)),
    );
    const lastLessonId =
      enrollment.lastLessonId && validLessonIds.has(enrollment.lastLessonId)
        ? enrollment.lastLessonId
        : null;

    return { sections, lastLessonId };
  }

  // ═══════════════════════════════════════════════════════
  //  API 5: Lesson Content
  // ═══════════════════════════════════════════════════════
  async getLessonContent(userId: string, slug: string, lessonId: number) {
    // Validate lesson thuộc course (qua slug)
    const course = await this.prisma.course.findFirst({
      where: {
        slug,
        status: { in: [CourseStatus.PUBLISHED, CourseStatus.UNPUBLISHED] },
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!course) {
      throw new NotFoundException('Không tìm thấy khóa học');
    }

    // Access check (admin/instructor bypass + enrollment + preview)
    const { lesson, isEnrolled, isPreviewOnly } =
      await this.lessonAccessService.assertCanAccessLessonWithBypass(
        userId,
        lessonId,
      );

    // Validate lesson thuộc course
    if (lesson.section.courseId !== course.id) {
      throw new NotFoundException('Bài giảng không thuộc khóa học này');
    }

    // Lấy resources (chỉ khi enrolled, không cho preview) trả thông tin resource để student có thể gọi API downloadResource
    let resources: any[] = [];
    if (isEnrolled && !isPreviewOnly) {
      resources = await this.prisma.lessonResource.findMany({
        where: { lessonId: lesson.id },
        select: {
          id: true,
          name: true,
          mimeType: true,
          size: true,
        },
      });
    }

    // Lấy completion status
    const lessonProgress = await this.prisma.lessonProgress.findUnique({
      where: {
        userId_lessonId: { userId, lessonId: lesson.id },
      },
      select: {
        isCompleted: true,
        completedAt: true,
        lastPositionSeconds: true,
      },
    });

    // Navigation: prev/next lesson (chỉ cho enrolled users)
    let navigation: any = null;
    if (isEnrolled && !isPreviewOnly) {
      navigation = await this.getLessonNavigation(
        course.id,
        lesson.section.id,
        lesson.order,
      );
    }

    return {
      lesson: {
        id: lesson.id,
        title: lesson.title,
        videoId: lesson.videoId,
        duration: lesson.duration,
        content: lesson.content,
        order: lesson.order,
        isPreview: lesson.isPreview,
        isCompleted: lessonProgress?.isCompleted ?? false,
        lastPosition: lessonProgress?.lastPositionSeconds ?? 0,
        resources,
      },
      navigation,
    };
  }

  /**
   * Tìm bài giảng trước/sau trong course (cross-section navigation).
   */
  private async getLessonNavigation(
    courseId: string,
    currentSectionId: number,
    currentOrder: number,
  ) {
    // Lấy tất cả lessons của course theo thứ tự
    const allLessons = await this.prisma.lesson.findMany({
      where: {
        deletedAt: null,
        section: {
          deletedAt: null,
          courseId,
        },
      },
      orderBy: [{ section: { order: 'asc' } }, { order: 'asc' }],
      select: {
        id: true,
        title: true,
        order: true,
        sectionId: true,
      },
    });

    const currentIndex = allLessons.findIndex(
      (l) => l.sectionId === currentSectionId && l.order === currentOrder,
    );
    if (currentIndex === -1) return { prevLesson: null, nextLesson: null };

    const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null;
    const nextLesson =
      currentIndex < allLessons.length - 1
        ? allLessons[currentIndex + 1]
        : null;

    return {
      prevLesson: prevLesson
        ? { id: prevLesson.id, title: prevLesson.title }
        : null,
      nextLesson: nextLesson
        ? { id: nextLesson.id, title: nextLesson.title }
        : null,
    };
  }

  // ═══════════════════════════════════════════════════════
  //  API 6: Download Resource từ R2
  // ═══════════════════════════════════════════════════════
  async downloadResource(userId: string, lessonId: number, resourceId: number) {
    // Access check (admin bypass + chặn preview + enrollment check)
    await this.lessonAccessService.assertCanDownloadResource(userId, lessonId);

    // Tìm resource
    const resource = await this.prisma.lessonResource.findFirst({
      where: {
        id: resourceId,
        lessonId,
      },
      select: {
        id: true,
        name: true,
        key: true,
        mimeType: true,
        size: true,
      },
    });

    if (!resource) {
      throw new NotFoundException('Tài nguyên không tồn tại');
    }

    // Kiểm tra file tồn tại trên R2
    const fileExist = await this.storageService.headObject(resource.key);
    if (!fileExist) {
      throw new NotFoundException(
        'Tài nguyên không tồn tại trên hệ thống lưu trữ',
      );
    }

    // Tạo signed URL (5 phút)
    const url = await this.storageService.getSignedUrl(resource.key, 300);

    return {
      url,
      name: resource.name,
      mimeType: resource.mimeType,
      size: resource.size,
      expiresIn: 300,
    };
  }

  // ═══════════════════════════════════════════════════════
  //  API 7: Recalculate Progress
  // ═══════════════════════════════════════════════════════
  async recalculateProgress(userId: string, courseId: string) {
    // Validate enrollment
    const enrollment = await this.lessonAccessService.assertEnrollment(
      userId,
      courseId,
    );

    const { progress, completedLessons, totalLessons, newStatus } =
      await this.calculateCourseProgress(userId, courseId, enrollment.status);

    // Cập nhật enrollment
    const updated = await this.prisma.enrollment.update({
      where: {
        userId_courseId: { userId, courseId },
      },
      data: {
        progress,
        status: newStatus,
      },
      select: {
        status: true,
        progress: true,
      },
    });

    return {
      progress: updated.progress,
      status: updated.status,
      completedLessons,
      totalLessons,
    };
  }

  // ═══════════════════════════════════════════════════════
  //  API 8: Complete Lesson
  // ═══════════════════════════════════════════════════════
  async completeLesson(userId: string, slug: string, lessonId: number) {
    // Tìm course bằng slug
    const course = await this.prisma.course.findFirst({
      where: {
        slug,
        status: { in: [CourseStatus.PUBLISHED, CourseStatus.UNPUBLISHED] },
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!course) {
      throw new NotFoundException('Không tìm thấy khóa học');
    }

    // Validate enrollment (phải ENROLLED hoặc IN_PROGRESS hoặc COMPLETED)
    await this.lessonAccessService.assertEnrollment(userId, course.id);

    // Validate lesson thuộc course
    const lesson = await this.prisma.lesson.findFirst({
      where: {
        id: lessonId,
        deletedAt: null,
        section: {
          deletedAt: null,
          courseId: course.id,
        },
      },
      select: {
        id: true,
      },
    });

    if (!lesson) {
      throw new NotFoundException(
        'Không tìm thấy bài giảng trong khóa học này',
      );
    }

    // Upsert LessonProgress
    const lessonProgress = await this.prisma.lessonProgress.upsert({
      where: {
        userId_lessonId: { userId, lessonId: lesson.id },
      },
      create: {
        userId,
        lessonId: lesson.id,
        isCompleted: true,
        completedAt: new Date(),
      },
      update: {
        isCompleted: true,
        completedAt: new Date(),
      },
      select: {
        isCompleted: true,
        completedAt: true,
      },
    });
    // Recalculate progress & auto-transition status
    const { progress, completedLessons, totalLessons, newStatus } =
      await this.calculateCourseProgress(userId, course.id);

    await this.prisma.enrollment.update({
      where: {
        userId_courseId: { userId, courseId: course.id },
      },
      data: {
        progress,
        status: newStatus,
      },
    });

    return {
      lessonId: lesson.id,
      isCompleted: lessonProgress.isCompleted,
      completedAt: lessonProgress.completedAt,
      courseProgress: {
        progress,
        status: newStatus,
        completedLessons,
        totalLessons,
      },
    };
  }

  // ═══════════════════════════════════════════════════════
  //  API 9: Uncomplete Lesson
  // ═══════════════════════════════════════════════════════

  async unCompleteLesson(userId: string, slug: string, lessonId: number) {
    // Tìm course bằng slug
    const course = await this.prisma.course.findFirst({
      where: {
        slug,
        status: { in: [CourseStatus.PUBLISHED, CourseStatus.UNPUBLISHED] },
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!course) {
      throw new NotFoundException('Không tìm thấy khóa học');
    }

    // Validate enrollment (phải ENROLLED hoặc IN_PROGRESS hoặc COMPLETED)
    await this.lessonAccessService.assertEnrollment(userId, course.id);

    // Validate lesson thuộc course
    const lesson = await this.prisma.lesson.findFirst({
      where: {
        id: lessonId,
        deletedAt: null,
        section: {
          deletedAt: null,
          courseId: course.id,
        },
      },
      select: {
        id: true,
      },
    });

    if (!lesson) {
      throw new NotFoundException(
        'Không tìm thấy bài giảng trong khóa học này',
      );
    }

    // Bỏ đánh dấu hoàn thành
    await this.prisma.lessonProgress.updateMany({
      where: { userId, lessonId: lesson.id },
      data: {
        isCompleted: false,
      },
    });

    // Recalculate progress & auto-transition status
    const { progress, completedLessons, totalLessons, newStatus } =
      await this.calculateCourseProgress(userId, course.id);

    await this.prisma.enrollment.update({
      where: {
        userId_courseId: { userId, courseId: course.id },
      },
      data: {
        progress,
        status: newStatus,
      },
    });

    return {
      lessonId: lesson.id,
      isCompleted: false,
      courseProgress: {
        progress,
        status: newStatus,
        completedLessons,
        totalLessons,
      },
    };
  }

  // ═══════════════════════════════════════════════════════
  //  Helper: Tính progress + auto-transition status
  // ═══════════════════════════════════════════════════════
  private async calculateCourseProgress(
    userId: string,
    courseId: string,
    currentStatus?: EnrollmentStatus,
  ) {
    // Đếm tổng lessons trong course
    const totalLessons = await this.prisma.lesson.count({
      where: {
        deletedAt: null,
        section: {
          deletedAt: null,
          courseId,
        },
      },
    });

    // Đếm lessons đã hoàn thành
    const completedLessons = await this.prisma.lessonProgress.count({
      where: {
        userId,
        isCompleted: true,
        lesson: {
          deletedAt: null,
          section: {
            deletedAt: null,
            courseId,
          },
        },
      },
    });

    const progress =
      totalLessons > 0
        ? Math.round((completedLessons / totalLessons) * 10000) / 100
        : 0;

    // Auto-transition enrollment status
    let newStatus: EnrollmentStatus;
    if (totalLessons > 0 && completedLessons >= totalLessons) {
      newStatus = EnrollmentStatus.COMPLETED;
    } else if (completedLessons > 0) {
      newStatus = EnrollmentStatus.IN_PROGRESS;
    } else {
      newStatus = EnrollmentStatus.ENROLLED;
    }

    return { progress, completedLessons, totalLessons, newStatus };
  }

  // ═══════════════════════════════════════════════════════
  //  API 10: Save progress lesson
  // ═══════════════════════════════════════════════════════
  async saveLessonProgress(
    userId: string,
    slug: string,
    lessonId: number,
    position: number,
  ) {
    const { course, lesson } =
      await this.lessonAccessService.assertLessonInEnrolledCourse(
        userId,
        slug,
        lessonId,
      );

    const max = lesson.duration ?? position;
    const safePosition = Math.max(0, Math.min(Math.floor(position), max));

    await this.prisma.$transaction([
      this.prisma.lessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId: lesson.id } },
        create: {
          userId,
          lessonId: lesson.id,
          lastPositionSeconds: safePosition,
        },
        update: { lastPositionSeconds: safePosition },
        select: { lessonId: true },
      }),
      // chỉ ghi khi bài khác với bài đã lưu → không ghi thừa mỗi 10s
      this.prisma.enrollment.updateMany({
        where: {
          userId,
          courseId: course.id,
          OR: [{ lastLessonId: null }, { lastLessonId: { not: lesson.id } }],
        },
        data: { lastLessonId: lesson.id },
      }),
    ]);

    return { lessonId: lesson.id, lastPosition: safePosition };
  }
}
