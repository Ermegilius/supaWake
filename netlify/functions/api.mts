import type { Config, Context } from '@netlify/functions';
import { getStore } from '@netlify/blobs';

interface Project {
  id: number;
  ref: string;
  label: string | null;
  api_key: string | null;
  strategy?: string;
  wake_email?: string;
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

async function pingRef(
  ref: string,
  apiKey: string | null | undefined,
  strategy: string = 'auth-signup',
  wakeEmail?: string,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['apikey'] = apiKey;

  try {
    let res: Response;
    if (strategy === 'auth-token') {
      // login probe: SELECT on auth.users, no user created, no email sent
      res = await fetch(`https://${ref}.supabase.co/auth/v1/token?grant_type=password`, {
        method: 'POST', headers,
        body: JSON.stringify({ email: 'supawake-probe@gmail.com', password: 'supawake-probe-v1' }),
        signal: AbortSignal.timeout(10000),
      });
    } else {
      // default: auth-signup (writes to auth.users, keeps project alive)
      const email = wakeEmail || 'wake@mailnull.com';
      // Confirmation link lands on the supaWake app instead of the project's
      // default localhost Site URL (only honored if allow-listed in the project).
      const redirectTo = encodeURIComponent('https://supa-wake.netlify.app');
      res = await fetch(`https://${ref}.supabase.co/auth/v1/signup?redirect_to=${redirectTo}`, {
        method: 'POST', headers,
        body: JSON.stringify({ email, password: 'supawake-keeper-v1' }),
        signal: AbortSignal.timeout(10000),
      });
    }
    const body = await res.json().catch(() => null);
    // both strategies hit the DB; surface 401 (bad key) but treat other 4xx as alive
    const status = res.status === 401 ? 401 : res.status < 500 ? 200 : res.status;
    return { status, body };
  } catch {
    return { status: 0, body: null };
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
      const body = await req.json().catch(() => ({})) as { ref?: string; api_key?: string; strategy?: string; wake_email?: string };
      const projects = await getProjects(store);
      const project = projects.find(p => p.id === id);

      if (!project) {
        if (!body.ref) return Response.json({ message: 'Not found' }, { status: 404, headers: CORS });
        const { status, body: supabaseBody } = await pingRef(body.ref, body.api_key, body.strategy, body.wake_email);
        return Response.json({
          id, ref: body.ref, label: null, api_key: body.api_key ?? null,
          last_pinged_at: new Date().toISOString(),
          last_status: status,
          supabase_body: supabaseBody,
          created_at: new Date().toISOString(),
        }, { headers: CORS });
      }

      const { status: pingStatus, body: supabaseBody } = await pingRef(project.ref, project.api_key, project.strategy, project.wake_email);
      project.last_status = pingStatus;
      project.last_pinged_at = new Date().toISOString();
      await saveProjects(store, projects);
      return Response.json({ ...project, supabase_body: supabaseBody }, { headers: CORS });
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
        api_key: body.api_key?.trim() || null,
        strategy: body.strategy ?? 'auth-signup',
        wake_email: body.wake_email || null,
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
