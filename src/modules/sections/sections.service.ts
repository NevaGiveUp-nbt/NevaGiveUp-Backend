import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { CleanupService } from '@/cleanup/cleanup.service';
import { CourseStatus } from '@prisma/client';
import { AuthorizationService } from '@/authorization/authorization.service';
import { ReorderSectionsDto } from './dto/reorder-sections.dto';

@Injectable()
export class SectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cleanupService: CleanupService,
    private readonly authorizationService: AuthorizationService,
  ) { }

  async create(createSectionDto: CreateSectionDto, userId: string) {
    try {
      const course = await this.prisma.course.findUnique({
        where: {
          id: createSectionDto.courseId,
        },
        select: {
          instructorId: true,
          status: true,
        },
      });
      if (!course) {
        throw new NotFoundException('Không tìm thấy khoá học');
      }
      const isAdmin = await this.authorizationService.hasRole(userId, 'ADMIN');

      if (!isAdmin && course.instructorId !== userId) {
        throw new ForbiddenException(
          'Bạn không có quyền thêm chưong vào khóa học này',
        );
      }
      if (
        !(
          [
            CourseStatus.DRAFT,
            CourseStatus.REJECTED,
            CourseStatus.UNPUBLISHED,
          ] as CourseStatus[]
        ).includes(course.status)
      ) {
        throw new BadRequestException(
          'Không thể chỉnh sửa nội dung khi khóa học đang xuất bản hoặc chờ duyệt',
        );
      }

      let order = createSectionDto.order;
      if (order === undefined) {
        order = await this.getNextOrder(createSectionDto.courseId)
      }
      else {
        await this.assertOrderAvailable(createSectionDto.courseId, order)
      }

      const section = await this.prisma.section.create({
        data: { ...createSectionDto, order },
      });
      return section;
    } catch (error: any) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException || error instanceof BadRequestException || error instanceof ConflictException) {
        throw error;
      }
      throw new InternalServerErrorException(error.message);
    }
  }

  async findAll(courseId: string) {
    try {
      return this.prisma.section.findMany({
        where: {
          courseId: courseId,
          deletedAt: null,
        },
        include: {
          lessons: {
            where: {
              deletedAt: null,
            },
            orderBy: {
              order: 'asc',
            },
            include: {
              resources: {
                select: {
                  id: true,
                  name: true,
                  mimeType: true,
                  size: true,
                },
              },
            },
          },
        },
        orderBy: {
          order: 'asc',
        },
      });
    } catch (error) {
      throw error;
    }
  }

  findOne(id: number) {
    return `This action returns a #${id} section`;
  }

  async update(
    id: number,
    userId: string,
    updateSectionDto: UpdateSectionDto,
  ) {
    try {
      const course = await this.prisma.course.findUnique({
        where: {
          id: updateSectionDto.courseId,
        },
      });
      if (!course) {
        throw new NotFoundException('Không tìm thấy khoá học');
      }

      if (
        !(
          [
            CourseStatus.DRAFT,
            CourseStatus.REJECTED,
            CourseStatus.UNPUBLISHED,
          ] as CourseStatus[]
        ).includes(course.status)
      ) {
        throw new BadRequestException(
          'Không thể chỉnh sửa nội dung khi khóa học đang xuất bản hoặc chờ duyệt',
        );
      }
      const section = await this.prisma.section.findUnique({
        where: {
          id: id,
          courseId: updateSectionDto.courseId,
        },
        include: {
          course: true,
        },
      });
      if (!section) {
        throw new NotFoundException('Không tìm thấy chương');
      }
      const isAdmin = await this.authorizationService.hasRole(
        userId,
        'ADMIN',
      );
      if (!isAdmin && section.course.instructorId !== userId) {
        throw new ConflictException('Bạn không có quyền sửa chương này');
      }

      // không cho đổi chương sang khóa học khác qua API này
      const { courseId: _courseId, ...data } = updateSectionDto;
      return this.prisma.section.update({
        where: {
          id: id,
        },
        data,
      });
    } catch (error: any) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(error.message);
    }
  }

  // ---- ORDER ----
  private async getNextOrder(courseId: string): Promise<number> {
    const last = await this.prisma.section.findFirst({
      where: {
        courseId: courseId,
        deletedAt: null,
      },
      orderBy: {
        order: 'desc',
      },
    });
    return last ? last.order + 1 : 1;
  }

  private async assertOrderAvailable(courseId: string, order: number) {
    const existed = await this.prisma.section.findFirst({
      where: { courseId, order },
      select: { title: true },
    });
    if (existed) {
      throw new ConflictException(
        `Thứ tự ${order} đã được dùng bởi chương "${existed.title}"`,
      );
    }
  }

  async reorder(userId: string, dto: ReorderSectionsDto) {
    const course = await this.prisma.course.findUnique({
      where: { id: dto.courseId },
      include: { sections: { select: { id: true } } },
    });
    if (!course) throw new BadRequestException('Không tìm thấy khóa học');

    const isAdmin = await this.authorizationService.hasRole(userId, 'ADMIN');
    if (!isAdmin && course.instructorId !== userId) {
      throw new ForbiddenException('Bạn không có quyền sắp xếp chương của khóa học này');
    }
    if (
      !(
        [CourseStatus.DRAFT, CourseStatus.REJECTED, CourseStatus.UNPUBLISHED] as CourseStatus[]
      ).includes(course.status)
    ) {
      throw new BadRequestException(
        'Không thể chỉnh sửa nội dung khi khóa học đang xuất bản hoặc chờ duyệt',
      );
    }

    const currentIds = new Set(course.sections.map((s) => s.id));
    const valid =
      dto.sectionIds.length === currentIds.size &&
      dto.sectionIds.every((id) => currentIds.has(id));
    if (!valid) {
      throw new BadRequestException('Danh sách chương không khớp với khóa học');
    }

    await this.prisma.$transaction(
      dto.sectionIds.map((id, index) =>
        this.prisma.section.update({ where: { id }, data: { order: index + 1 } }),
      ),
    );
    return { message: 'Đã cập nhật thứ tự chương' };
  }

  async remove(id: number, instructorId: string) {
    try {
      const section = await this.prisma.section.findUnique({
        where: {
          id: id,
        },
        include: {
          course: true,
        },
      });
      if (!section) {
        throw new NotFoundException('Không tìm thấy section');
      }
      const isAdmin = await this.authorizationService.hasRole(
        instructorId,
        'ADMIN',
      );
      if (!isAdmin && section.course.instructorId !== instructorId) {
        throw new UnauthorizedException('Bạn không có quyền xoá section này');
      }
      if (
        !(
          [
            CourseStatus.DRAFT,
            CourseStatus.REJECTED,
            CourseStatus.UNPUBLISHED,
          ] as CourseStatus[]
        ).includes(section.course.status)
      ) {
        throw new BadRequestException(
          'Không thể chỉnh sửa nội dung khi khóa học đang xuất bản hoặc chờ duyệt',
        );
      }
      const deletedSection = await this.prisma.section.update({
        where: {
          id: id,
        },
        data: {
          deletedAt: new Date(),
        },
      });
      this.cleanupService.addSectionCleanupJob(id);
      return deletedSection;
    } catch (error: any) {
      if (
        error instanceof NotFoundException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(error.message);
    }
  }
}
