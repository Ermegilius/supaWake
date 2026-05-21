import { useEffect, useState } from "react";

interface Project {
  id: number;
  ref: string;
  label: string | null;
  api_key: string | null;
  last_pinged_at: string | null;
  last_status: number | null;
  created_at: string;
}

const API = "/api/projects";

function statusBadge(status: number | null): { text: string; color: string } {
  if (status === null) return { text: "never pinged", color: "#aaa" };
  if (status === 0) return { text: "unreachable", color: "#e74c3c" };
  if (status === 401)
    return { text: "401 — missing API key", color: "#e67e22" };
  if (status >= 200 && status < 300)
    return { text: `${status} ok`, color: "#27ae60" };
  return { text: String(status), color: "#f39c12" };
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [ref, setRef] = useState("");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(true);
  const [activePing, setActivePing] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setBusy(true);
    try {
      const res = await fetch(API);
      setProjects(await res.json());
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
    setBusy(true);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ref: ref.trim(),
          label: label.trim() || undefined,
          api_key: apiKey.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "Failed to add project");
      setProjects((prev) => [body, ...prev]);
      setRef("");
      setLabel("");
      setApiKey("");
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
      setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } finally {
      setBusy(false);
      setActivePing(null);
    }
  }

  return (
    <>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: busy ? "#3ecf8e" : "transparent",
          transition: "background 0.2s",
          zIndex: 999,
        }}
      />

      <div
        style={{
          maxWidth: 680,
          margin: "0 auto",
          padding: "2rem 1rem",
          fontFamily: "system-ui, sans-serif",
          opacity: busy ? 0.6 : 1,
          transition: "opacity 0.15s",
          pointerEvents: busy ? "none" : "auto",
        }}
      >
        <h1 style={{ fontSize: "2rem", marginBottom: 4 }}>supaWake</h1>
        <p style={{ color: "#666", marginBottom: "2rem", marginTop: 0 }}>
          Keeps your Supabase free-tier projects alive, auto-pings every 3 days.
        </p>

        {/* Row 1: ref + label + Add */}
        <div
          style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}
        >
          <input
            placeholder='Project ref or URL  (e.g. abcdefghijklmnop)'
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            style={inputStyle}
          />
          <input
            placeholder='Label (optional)'
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            style={{ ...inputStyle, flex: "1 1 140px" }}
          />
          <button onClick={add} style={addBtnStyle}>
            Add
          </button>
        </div>

        {/* Row 2: API key */}
        <input
          placeholder='Anon or Publishable key from Supabase → Project Settings → API Keys'
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          style={{
            ...inputStyle,
            flex: "unset",
            width: "100%",
            boxSizing: "border-box",
            marginBottom: 4,
            fontFamily: "monospace",
            fontSize: 12,
          }}
        />
        <p
          style={{
            margin: "0 0 8px",
            fontSize: 11,
            color: "#e74c3c",
            fontWeight: 600,
          }}
        >
          ⚠ DO NOT INPUT SECRET KEYS OR SERVICE ROLE KEYS HERE, anon /
          publishable keys only. This is a public app.
        </p>

        {error && (
          <p style={{ color: "#e74c3c", fontSize: 13, margin: "0 0 12px" }}>
            {error}
          </p>
        )}

        {projects.length === 0 && !busy ? (
          <p style={{ color: "#aaa", marginTop: "3rem", textAlign: "center" }}>
            No projects yet.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {projects.map((p) => {
              const badge = statusBadge(p.last_status);
              return (
                <li key={p.id} style={rowStyle}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {p.label || p.ref}
                      {!p.api_key && (
                        <span
                          style={{
                            fontSize: 11,
                            color: "#e67e22",
                            fontWeight: 400,
                          }}
                        >
                          no API key
                        </span>
                      )}
                    </div>
                    {p.label && (
                      <div style={{ fontSize: 12, color: "#999" }}>
                        {p.ref}.supabase.co
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: "#bbb", marginTop: 2 }}>
                      last ping: {timeAgo(p.last_pinged_at)}
                      {p.last_status !== null && (
                        <span
                          style={{
                            marginLeft: 8,
                            color: badge.color,
                            fontWeight: 600,
                          }}
                        >
                          {badge.text}
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => ping(p.id)} style={pingBtnStyle}>
                    {activePing === p.id ? "..." : "Ping now"}
                  </button>
                  <button onClick={() => remove(p.id)} style={removeBtnStyle}>
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p
          style={{
            color: "#ddd",
            fontSize: 12,
            marginTop: "3rem",
            textAlign: "center",
          }}
        >
          auto-pings /auth/v1/health every 3 days
        </p>
      </div>
    </>
  );
}

const inputStyle: React.CSSProperties = {
  flex: "2 1 240px",
  padding: "8px 12px",
  border: "1px solid #ddd",
  borderRadius: 6,
  fontSize: 14,
  outline: "none",
};

const addBtnStyle: React.CSSProperties = {
  padding: "8px 20px",
  background: "#3ecf8e",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 14,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "12px 0",
  borderBottom: "1px solid #f0f0f0",
};

const pingBtnStyle: React.CSSProperties = {
  padding: "6px 12px",
  background: "#f5f5f5",
  border: "1px solid #ddd",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
  whiteSpace: "nowrap",
};

const removeBtnStyle: React.CSSProperties = {
  padding: "6px 12px",
  background: "#fff",
  border: "1px solid #fcc",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
  color: "#e74c3c",
  whiteSpace: "nowrap",
};
