import type { Config, Context } from '@netlify/functions';
import { getStore } from '@netlify/blobs';

interface Project {
  id: number;
  ref: string;
  label: string | null;
  last_pinged_at: string | null;
  last_status: number | null;
  created_at: string;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function normalizeRef(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/([a-z0-9]+)\.supabase\.co/);
  if (urlMatch) return urlMatch[1];
  if (/^[a-z0-9]+$/.test(trimmed)) return trimmed;
  throw new Error('Invalid Supabase project reference. Use "xyzabcdef" or "https://xyzabcdef.supabase.co"');
}

async function pingRef(ref: string): Promise<number> {
  try {
    const res = await fetch(`https://${ref}.supabase.co/auth/v1/health`, {
      signal: AbortSignal.timeout(10000),
    });
    return res.status;
  } catch {
    return 0;
  }
}

async function getProjects(store: ReturnType<typeof getStore>): Promise<Project[]> {
  const data = await store.get('list', { type: 'json' });
  return (data as Project[]) ?? [];
}

async function saveProjects(store: ReturnType<typeof getStore>, projects: Project[]): Promise<void> {
  await store.set('list', JSON.stringify(projects));
}

export default async function handler(req: Request, _context: Context) {
  const store = getStore({ name: 'projects', consistency: 'strong' });
  const url = new URL(req.url);
  const path = url.pathname;

  const match = path.match(/\/api\/projects(?:\/(\d+)(?:\/(ping))?)?/);
  const id = match?.[1] ? parseInt(match[1]) : null;
  const isPing = match?.[2] === 'ping';

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    if (req.method === 'POST' && id && isPing) {
      const body = await req.json().catch(() => ({})) as { ref?: string };
      const projects = await getProjects(store);
      const project = projects.find(p => p.id === id);

      if (!project) {
        if (!body.ref) return Response.json({ message: 'Not found' }, { status: 404, headers: CORS });
        const status = await pingRef(body.ref);
        return Response.json({
          id, ref: body.ref, label: null,
          last_pinged_at: new Date().toISOString(),
          last_status: status,
          created_at: new Date().toISOString(),
        }, { headers: CORS });
      }

      project.last_status = await pingRef(project.ref);
      project.last_pinged_at = new Date().toISOString();
      await saveProjects(store, projects);
      return Response.json(project, { headers: CORS });
    }

    if (req.method === 'DELETE' && id) {
      const projects = await getProjects(store);
      await saveProjects(store, projects.filter(p => p.id !== id));
      return Response.json({ ok: true }, { headers: CORS });
    }

    if (req.method === 'GET') {
      const projects = await getProjects(store);
      return Response.json(projects, { headers: CORS });
    }

    if (req.method === 'POST' && !id) {
      const body = await req.json();
      const normalized = normalizeRef(body.ref);
      const projects = await getProjects(store);
      if (projects.find(p => p.ref === normalized)) {
        return Response.json({ message: 'Project already exists' }, { status: 409, headers: CORS });
      }
      const maxId = projects.reduce((m, p) => Math.max(m, p.id), 0);
      const project: Project = {
        id: maxId + 1,
        ref: normalized,
        label: body.label ?? null,
        last_pinged_at: null,
        last_status: null,
        created_at: new Date().toISOString(),
      };
      projects.unshift(project);
      await saveProjects(store, projects);
      return Response.json(project, { status: 201, headers: CORS });
    }

    return new Response('Method not allowed', { status: 405, headers: CORS });
  } catch (e: any) {
    return Response.json({ message: e.message }, { status: 400, headers: CORS });
  }
}

export const config: Config = {
  path: '/api/projects*',
};
