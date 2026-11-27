import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const sections = await prisma.section.findMany({ select: { id: true } });
  for (const s of sections) {
    const lessons = await prisma.lesson.findMany({
      where: { sectionId: s.id },
      orderBy: [{ order: 'asc' }, { id: 'asc' }], // trùng order thì bài tạo trước đứng trước
      select: { id: true },
    });
    await prisma.$transaction(
      lessons.map((l, i) =>
        prisma.lesson.update({ where: { id: l.id }, data: { order: i + 1 } }),
      ),
    );
  }
}
main().finally(() => prisma.$disconnect());