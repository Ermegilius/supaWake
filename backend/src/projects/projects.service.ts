import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Database from 'better-sqlite3';
import * as path from 'path';

interface Project {
  id: number;
  ref: string;
  label: string | null;
  last_pinged_at: string | null;
  last_status: number | null;
  created_at: string;
}

@Injectable()
export class ProjectsService implements OnModuleInit {
  private db: Database.Database;

  onModuleInit() {
    this.db = new Database(path.join(process.cwd(), 'projects.db'));
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ref TEXT NOT NULL UNIQUE,
        label TEXT,
        last_pinged_at TEXT,
        last_status INTEGER,
        created_at TEXT NOT NULL
      )
    `);
  }

  findAll(): Project[] {
    return this.db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as Project[];
  }

  create(ref: string, label?: string): Project {
    const normalized = this.normalizeRef(ref);
    const stmt = this.db.prepare(
      'INSERT INTO projects (ref, label, created_at) VALUES (?, ?, ?)',
    );
    const result = stmt.run(normalized, label ?? null, new Date().toISOString());
    return this.db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid) as Project;
  }

  remove(id: number): void {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  }

  async ping(id: number): Promise<Project> {
    const project = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project;
    if (!project) throw new Error('Project not found');
    const status = await this.pingRef(project.ref);
    this.db
      .prepare('UPDATE projects SET last_pinged_at = ?, last_status = ? WHERE id = ?')
      .run(new Date().toISOString(), status, id);
    return this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project;
  }

  @Cron('0 0 */3 * *')
  async pingAll(): Promise<void> {
    const projects = this.findAll();
    console.log(`[cron] Pinging ${projects.length} project(s)...`);
    for (const project of projects) {
      const status = await this.pingRef(project.ref);
      this.db
        .prepare('UPDATE projects SET last_pinged_at = ?, last_status = ? WHERE id = ?')
        .run(new Date().toISOString(), status, project.id);
      console.log(`[cron] ${project.ref} -> ${status}`);
    }
  }

  private async pingRef(ref: string): Promise<number> {
    try {
      const res = await fetch(`https://${ref}.supabase.co/auth/v1/health`, {
        signal: AbortSignal.timeout(10000),
      });
      return res.status;
    } catch {
      return 0;
    }
  }

  private normalizeRef(input: string): string {
    const trimmed = input.trim();
    const urlMatch = trimmed.match(/([a-z0-9]+)\.supabase\.co/);
    if (urlMatch) return urlMatch[1];
    if (/^[a-z0-9]+$/.test(trimmed)) return trimmed;
    throw new Error(
      'Invalid Supabase project reference. Use "xyzabcdef" or "https://xyzabcdef.supabase.co"',
    );
  }
}
