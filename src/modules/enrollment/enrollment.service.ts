import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { UpdateEnrollmentDto } from './dto/update-enrollment.dto';
import { CourseStatus, CourseType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class EnrollmentService {
  constructor(
    private readonly prisma: PrismaService,
  ) { }
  create(createEnrollmentDto: CreateEnrollmentDto) {
    return 'This action adds a new enrollment';
  }

  findAll() {
    return `This action returns all enrollment`;
  }

  findOne(id: number) {
    return `This action returns a #${id} enrollment`;
  }

  update(id: number, updateEnrollmentDto: UpdateEnrollmentDto) {
    return `This action updates a #${id} enrollment`;
  }

  remove(id: number) {
    return `This action removes a #${id} enrollment`;
  }

  async enrollFreeCourse(userId: string, slug: string) {
    //điều kiện check course published, chưa bị xóa, và có tồn tại
    const publishedCourse = {
      slug,
      status: CourseStatus.PUBLISHED,
      deletedAt: null
    }

    return await this.prisma.$transaction(async (tx) => {
      const course = await tx.course.findFirst({
        where: publishedCourse,
        select: { id: true, courseType: true }
      })

      if (!course) {
        throw new NotFoundException('Không tìm thấy khóa học')
      }

      if (course.courseType !== CourseType.FREE) {
        throw new ConflictException("Khóa học này không yêu cầu thanh toán")
      }

      const enrollment = await tx.enrollment.createMany({
        data: [{ userId, courseId: course.id }],
        skipDuplicates: true
      })

      if (enrollment.count === 1) {
        const updated = await tx.course.updateMany({
          where: {
            ...publishedCourse,
            id: course.id,
            courseType: CourseType.FREE
          },
          data: {
            studentCount: { increment: 1 }
          }
        })
        if (updated.count === 0) {
          throw new ConflictException("Khóa học vừa thay đổi trạng thái đăng ký")
        }
      }
      return { courseSlug: slug, isEnrolled: true }
    })
  }
}
