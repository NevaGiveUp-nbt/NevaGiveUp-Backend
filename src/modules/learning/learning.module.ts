import { Module } from '@nestjs/common';
import { LearningController } from './learning.controller';
import { LearningService } from './learning.service';
import { PrismaModule } from '@/prisma/prisma.module';
import { LessonsModule } from '@/modules/lessons/lessons.module';
import { StorageModule } from '@/storage/storage.module';
import { AuthorizationModule } from '@/authorization/authorization.module';

@Module({
  imports: [PrismaModule, LessonsModule, StorageModule, AuthorizationModule],
  controllers: [LearningController],
  providers: [LearningService],
})
export class LearningModule {}
