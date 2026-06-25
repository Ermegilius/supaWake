import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

interface Project {
  id: number;
  ref: string;
  api_key: string | null;
  strategy?: string;
  wake_email?: string;
  last_pinged_at: string | null;
  last_status: number | null;
}

async function pingProject(ref: string, apiKey: string | null, strategy: string = "auth-signup", wakeEmail?: string): Promise<number> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["apikey"] = apiKey;

  try {
    let res: Response;
    if (strategy === "auth-token") {
      // login probe: SELECT on auth.users, no user created, no email sent
      res = await fetch(`https://${ref}.supabase.co/auth/v1/token?grant_type=password`, {
        method: "POST", headers,
        body: JSON.stringify({ email: "supawake-probe@gmail.com", password: "supawake-probe-v1" }),
        signal: AbortSignal.timeout(10000),
      });
    } else {
      // default: auth-signup (writes to auth.users, keeps project alive)
      const email = wakeEmail || "wake@mailnull.com";
      res = await fetch(`https://${ref}.supabase.co/auth/v1/signup`, {
        method: "POST", headers,
        body: JSON.stringify({ email, password: "supawake-keeper-v1" }),
        signal: AbortSignal.timeout(10000),
      });
    }
    // both strategies hit the DB; surface 401 (bad key) but treat other 4xx as alive
    return res.status === 401 ? 401 : res.status < 500 ? 200 : res.status;
  } catch {
    return 0;
  }
}

export default async function handler() {
  const store = getStore({ name: "projects", consistency: "strong" });
  const projects: Project[] = (await store.get("list", { type: "json" })) ?? [];

  console.log(`[cron] Pinging ${projects.length} project(s)...`);

  for (const project of projects) {
    project.last_status = await pingProject(project.ref, project.api_key, project.strategy, project.wake_email);
    project.last_pinged_at = new Date().toISOString();
    console.log(`[cron] ${project.ref} -> ${project.last_status}`);
  }

  await store.set("list", JSON.stringify(projects));
}

export const config: Config = {
  schedule: "0 0 */3 * *",
};
