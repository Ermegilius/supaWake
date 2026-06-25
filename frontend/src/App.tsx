import { useEffect, useState } from "react";

interface Project {
  id: number;
  ref: string;
  label: string | null;
  api_key: string | null;
  strategy?: string;
  last_pinged_at: string | null;
  last_status: number | null;
  created_at: string;
}

const API = "/api/projects";

const STRATEGY_INFO: Record<string, { what: string; db: string }> = {
  "auth-signup": {
    what:
      "Each ping calls POST /auth/v1/signup with your email. The first ping registers a user; later pings get “user already registered”.",
    db:
      "Adds one row to your auth.users table. This write keeps the project awake. Heads-up: if “Confirm email” is on and you don't click the link, Supabase re-sends a confirmation email on every ping (every 3 days). Confirm it once to stop the reminders, or use auth/token instead (no emails).",
  },
  "auth-token": {
    what:
      "Each ping calls POST /auth/v1/token (login) with throwaway credentials. It always fails with “invalid credentials”.",
    db:
      "Runs a read on your auth.users table. No user is created and no email is sent. The read keeps the project awake. Experimental: still being validated.",
  },
};

type StatusView = { dot: string; text: string; textCls: string };

function statusView(status: number | null): StatusView {
  if (status === null)
    return { dot: "bg-night-500", text: "never pinged", textCls: "text-fog-500" };
  if (status === 0)
    return {
      dot: "bg-dark-500 shadow-[0_0_8px_1px_#e7574f66]",
      text: "unreachable",
      textCls: "text-dark-500",
    };
  if (status === 401)
    return {
      dot: "bg-warn-500 shadow-[0_0_8px_1px_#f0a33066]",
      text: "401 no key",
      textCls: "text-warn-500",
    };
  if (status >= 200 && status < 300)
    return {
      dot: "bg-wake-400 shadow-[0_0_12px_3px_#5be39b66]",
      text: `${status} awake`,
      textCls: "text-wake-400",
    };
  return {
    dot: "bg-warn-500 shadow-[0_0_8px_1px_#f0a33066]",
    text: String(status),
    textCls: "text-warn-500",
  };
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const inputCls =
  "w-full bg-night-850 border-2 border-night-600 px-3 py-2 text-fog-100 outline-none transition-colors focus:border-beam-500 focus:ring-2 focus:ring-beam-500/25";

const btnPrimary =
  "shrink-0 border-2 border-wake-500 bg-wake-500 px-5 py-2 font-bold uppercase tracking-wide text-night-950 pixel-shadow-sm transition-all hover:bg-wake-400 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none";

const btnGhost =
  "shrink-0 border-2 border-beam-500/70 bg-transparent px-3 py-1.5 uppercase tracking-wide text-beam-300 transition-colors hover:bg-beam-500/10 active:translate-x-[2px] active:translate-y-[2px]";

const btnDanger =
  "shrink-0 border-2 border-dark-500/60 bg-transparent px-3 py-1.5 uppercase tracking-wide text-dark-500 transition-colors hover:bg-dark-500/10 active:translate-x-[2px] active:translate-y-[2px]";

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [ref, setRef] = useState("");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [strategy, setStrategy] = useState("auth-signup");
  const [wakeEmail, setWakeEmail] = useState("");
  const [busy, setBusy] = useState(true);
  const [activePing, setActivePing] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setBusy(true);
    try {
      const res = await fetch(API);
      if (!res.ok) return;
      setProjects(await res.json());
    } catch {
      /* API unavailable; leave list as-is */
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function add() {
    setError("");
    if (!ref.trim() || busy) return;
    if (strategy === "auth-signup" && !wakeEmail.trim()) {
      setError("auth/signup requires a real email address.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ref: ref.trim(),
          label: label.trim() || undefined,
          api_key: apiKey.trim() || undefined,
          strategy,
          wake_email: wakeEmail.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "Failed to add project");
      setProjects((prev) => [body, ...prev]);
      setRef("");
      setLabel("");
      setApiKey("");
      setStrategy("auth-signup");
      setWakeEmail("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`${API}/${id}`, { method: "DELETE" });
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  async function ping(id: number) {
    if (busy) return;
    setBusy(true);
    setActivePing(id);
    try {
      const project = projects.find((p) => p.id === id);
      const res = await fetch(`${API}/${id}/ping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: project?.ref, api_key: project?.api_key }),
      });
      if (!res.ok) return;
      const updated = await res.json();
      console.log(`[supaWake] ping response for ${updated.ref}:`, updated.supabase_body);
      setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
      setActivePing(null);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    add();
  }

  const info = STRATEGY_INFO[strategy];

  return (
    <>
      {/* Flashlight beam from above; light keeps the Darkness at bay. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[60vh] w-[120vw] -translate-x-1/2 bg-[radial-gradient(50%_55%_at_50%_0%,rgba(255,224,150,0.16),transparent_70%)]" />
        <div className="beam-cone absolute left-1/2 top-0 h-[88vh] w-[150vw] -translate-x-1/2 mix-blend-screen bg-[linear-gradient(to_bottom,rgba(255,238,190,0.22),rgba(255,224,150,0.06)_45%,transparent_80%)] animate-[beam-flicker_6s_linear_infinite]" />
      </div>

      {/* Busy indicator: a thin beam line. */}
      <div aria-hidden className="fixed inset-x-0 top-0 z-50 h-[3px] overflow-hidden">
        <div className={`h-full ${busy ? "bg-beam-500 animate-pulse" : "bg-transparent"}`} />
      </div>

      <main
        aria-busy={busy}
        className={`relative z-10 mx-auto max-w-2xl px-4 py-12 transition-opacity duration-150 ${
          busy ? "pointer-events-none opacity-60" : "opacity-100"
        }`}
      >
        <header className="mb-9 text-center">
          <h1 className="font-display text-xl text-beam-100 [text-shadow:0_0_18px_#ffe7a0aa,4px_4px_0_#000] sm:text-2xl">
            supaWake
          </h1>
          <p className="mt-4 text-lg text-fog-500">
            Keeps your Supabase free-tier projects awake. Auto-pings every 3 days.
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          className="border-2 border-night-600 bg-night-900/85 p-4 pixel-shadow backdrop-blur-sm"
        >
          {/* Row 1: ref + label + Add */}
          <div className="mb-2 flex flex-wrap gap-2">
            <input
              aria-label="Supabase project ref or URL"
              placeholder="Project ref or URL"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              className={`${inputCls} flex-[2_1_220px]`}
            />
            <input
              aria-label="Project label (optional)"
              placeholder="Label (optional)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className={`${inputCls} flex-[1_1_120px]`}
            />
            <button type="submit" className={btnPrimary}>
              Add
            </button>
          </div>

          {/* Row 2: strategy */}
          <select
            aria-label="Ping strategy"
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            className={`${inputCls} mb-2 cursor-pointer`}
          >
            <option value="auth-signup">auth/signup (default, needs real email)</option>
            <option value="auth-token">auth/token (login probe, testing)</option>
          </select>

          {info && (
            <div className="mb-2 border-l-2 border-beam-500 bg-night-850 px-3 py-2 text-base leading-relaxed text-fog-500">
              <p>{info.what}</p>
              <p className="mt-1.5">
                <span className="text-beam-300">Your database:</span> {info.db}
              </p>
            </div>
          )}

          {strategy === "auth-signup" && (
            <input
              type="email"
              aria-label="Your real email (required for auth/signup)"
              placeholder="Your real email (required for auth/signup)"
              value={wakeEmail}
              onChange={(e) => setWakeEmail(e.target.value)}
              className={`${inputCls} mb-2`}
            />
          )}

          {/* Row 3: API key */}
          <input
            aria-label="Anon or publishable API key"
            placeholder="Anon / Publishable key (Settings → API Keys)"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className={`${inputCls} mb-2`}
          />

          <p className="border-2 border-dark-500/40 bg-dark-500/10 px-3 py-2 text-sm uppercase tracking-wide text-dark-500">
            ⚠ Do not input secret or service-role keys here. Anon / publishable
            keys only. This is a public app.
          </p>

          {error && (
            <p role="alert" className="mt-3 text-base text-dark-500">
              {error}
            </p>
          )}
        </form>

        {projects.length === 0 && !busy ? (
          <p className="mt-12 text-center text-lg text-fog-500">
            No projects yet. Nothing to keep awake.
          </p>
        ) : (
          <ul className="mt-6 flex flex-col gap-2">
            {projects.map((p) => {
              const s = statusView(p.last_status);
              return (
                <li
                  key={p.id}
                  className="flex items-center gap-3 border-2 border-night-700 bg-night-850 p-3 pixel-shadow-sm"
                >
                  <span
                    aria-hidden
                    className={`h-3.5 w-3.5 shrink-0 ${s.dot}`}
                    title={s.text}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-fog-100">
                        {p.label || p.ref}
                      </span>
                      <span className="border border-night-600 px-1.5 text-sm uppercase tracking-wide text-fog-500">
                        {p.strategy ?? "auth-signup"}
                      </span>
                      {!p.api_key && (
                        <span className="text-sm uppercase text-warn-500">no API key</span>
                      )}
                    </div>
                    {p.label && (
                      <div className="truncate text-base text-fog-500">
                        {p.ref}.supabase.co
                      </div>
                    )}
                    <div className="mt-0.5 text-base text-fog-500">
                      last ping: {timeAgo(p.last_pinged_at)}
                      {p.last_status !== null && (
                        <span className={`ml-2 font-semibold ${s.textCls}`}>{s.text}</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Ping ${p.label || p.ref} now`}
                    onClick={() => ping(p.id)}
                    className={btnGhost}
                  >
                    {activePing === p.id ? "···" : "Ping now"}
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${p.label || p.ref}`}
                    onClick={() => remove(p.id)}
                    className={btnDanger}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-12 text-center text-base text-fog-500">
          auto-pings the auth API every 3 days
        </p>
      </main>
    </>
  );
}
