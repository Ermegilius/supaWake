import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  findAll() {
    return this.projectsService.findAll();
  }

  @Post()
  create(@Body() body: { ref: string; label?: string }) {
    return this.projectsService.create(body.ref, body.label);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    this.projectsService.remove(+id);
    return { ok: true };
  }

  @Post(':id/ping')
  async ping(@Param('id') id: string) {
    return this.projectsService.ping(+id);
  }
}
