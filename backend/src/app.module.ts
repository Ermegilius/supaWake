import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ProjectsModule } from './projects/projects.module';

@Module({
  imports: [ScheduleModule.forRoot(), ProjectsModule],
})
export class AppModule {}
