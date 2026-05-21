import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';

interface Project {
  id: number;
  ref: string;
  api_key: string | null;
  last_pinged_at: string | null;
  last_status: number | null;
}

export default async function handler() {
  const store = getStore({ name: 'projects', consistency: 'strong' });
  const projects: Project[] = (await store.get('list', { type: 'json' })) ?? [];

  console.log(`[cron] Pinging ${projects.length} project(s)...`);

  for (const project of projects) {
    try {
      const headers: Record<string, string> = {};
      if (project.api_key) headers['apikey'] = project.api_key;
      const res = await fetch(`https://${project.ref}.supabase.co/auth/v1/health`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });
      project.last_status = res.status;
    } catch {
      project.last_status = 0;
    }
    project.last_pinged_at = new Date().toISOString();
    console.log(`[cron] ${project.ref} -> ${project.last_status}`);
  }

  await store.set('list', JSON.stringify(projects));
}

export const config: Config = {
  schedule: '0 0 */3 * *',
};
