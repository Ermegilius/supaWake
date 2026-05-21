import { useEffect, useState } from 'react';

interface Project {
  id: number;
  ref: string;
  label: string | null;
  last_pinged_at: string | null;
  last_status: number | null;
  created_at: string;
}

const API = '/projects';

function statusBadge(status: number | null): { text: string; color: string } {
  if (status === null) return { text: 'never pinged', color: '#aaa' };
  if (status === 0) return { text: 'unreachable', color: '#e74c3c' };
  if (status >= 200 && status < 300) return { text: `${status} ok`, color: '#27ae60' };
  return { text: String(status), color: '#f39c12' };
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [ref, setRef] = useState('');
  const [label, setLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [pinging, setPinging] = useState<number | null>(null);
  const [error, setError] = useState('');

  async function load() {
    const res = await fetch(API);
    setProjects(await res.json());
  }

  useEffect(() => { load(); }, []);

  async function add() {
    setError('');
    if (!ref.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: ref.trim(), label: label.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message ?? 'Failed to add project');
      }
      setRef('');
      setLabel('');
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: number) {
    await fetch(`${API}/${id}`, { method: 'DELETE' });
    await load();
  }

  async function ping(id: number) {
    setPinging(id);
    await fetch(`${API}/${id}/ping`, { method: 'POST' });
    await load();
    setPinging(null);
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '2rem 1rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: 4 }}>supaWake</h1>
      <p style={{ color: '#666', marginBottom: '2rem', marginTop: 0 }}>
        Keeps your Supabase free-tier projects alive — auto-pings every 3 days.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <input
          placeholder="Project ref or URL  (e.g. abcdefghijklmnop)"
          value={ref}
          onChange={e => setRef(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          style={inputStyle}
        />
        <input
          placeholder="Label (optional)"
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          style={{ ...inputStyle, flex: '1 1 140px' }}
        />
        <button onClick={add} disabled={adding} style={addBtnStyle}>
          {adding ? '...' : 'Add'}
        </button>
      </div>

      {error && <p style={{ color: '#e74c3c', fontSize: 13, margin: '0 0 12px' }}>{error}</p>}

      {projects.length === 0 ? (
        <p style={{ color: '#aaa', marginTop: '3rem', textAlign: 'center' }}>No projects yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {projects.map(p => {
            const badge = statusBadge(p.last_status);
            return (
              <li key={p.id} style={rowStyle}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{p.label || p.ref}</div>
                  {p.label && (
                    <div style={{ fontSize: 12, color: '#999' }}>{p.ref}.supabase.co</div>
                  )}
                  <div style={{ fontSize: 12, color: '#bbb', marginTop: 2 }}>
                    last ping: {timeAgo(p.last_pinged_at)}
                    {p.last_status !== null && (
                      <span style={{ marginLeft: 8, color: badge.color, fontWeight: 600 }}>
                        {badge.text}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => ping(p.id)}
                  disabled={pinging === p.id}
                  style={pingBtnStyle}
                >
                  {pinging === p.id ? '...' : 'Ping now'}
                </button>
                <button onClick={() => remove(p.id)} style={removeBtnStyle}>
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p style={{ color: '#ddd', fontSize: 12, marginTop: '3rem', textAlign: 'center' }}>
        auto-pings /auth/v1/health every 3 days
      </p>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  flex: '2 1 240px',
  padding: '8px 12px',
  border: '1px solid #ddd',
  borderRadius: 6,
  fontSize: 14,
  outline: 'none',
};

const addBtnStyle: React.CSSProperties = {
  padding: '8px 20px',
  background: '#3ecf8e',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 14,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '12px 0',
  borderBottom: '1px solid #f0f0f0',
};

const pingBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  background: '#f5f5f5',
  border: '1px solid #ddd',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
  whiteSpace: 'nowrap',
};

const removeBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  background: '#fff',
  border: '1px solid #fcc',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
  color: '#e74c3c',
  whiteSpace: 'nowrap',
};
