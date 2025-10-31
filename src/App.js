// src/App.js
import React, { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  RefreshCw,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

// ---------------- config ----------------
const RAW_API = (process.env.REACT_APP_API_URL || "/api").trim().replace(/\/+$/, "");
const API_URL = RAW_API || "/api";
const BUILD_TAG = process.env.REACT_APP_BUILD_TAG || "dev";

// -------------- small ui bits --------------
const Pill = ({ children, className = "" }) => (
  <span
    className={
      "inline-flex items-center justify-center rounded-full px-3 py-1 text-sm " +
      className
    }
  >
    {children}
  </span>
);

const Button = ({
  children,
  onClick,
  variant = "primary",
  size = "md",
  disabled,
  className = "",
  type = "button",
  title,
}) => {
  const base =
    "inline-flex items-center gap-2 rounded-xl font-medium transition-colors focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed";
  const sizes = {
    sm: "text-sm px-3 py-1.5",
    md: "text-sm px-4 py-2",
  };
  const variants = {
    primary: "bg-indigo-600 hover:bg-indigo-700 text-white",
    ghost:
      "bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
    danger: "bg-rose-600 hover:bg-rose-700 text-white",
    dark: "bg-slate-900 hover:bg-black text-white",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      title={title}
    >
      {children}
    </button>
  );
};

const Toast = ({ toast, clear }) => {
  if (!toast) return null;
  const color =
    toast.type === "error"
      ? "bg-rose-600"
      : toast.type === "warn"
      ? "bg-amber-500"
      : "bg-emerald-600";
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60]">
      <div
        className={`${color} text-white rounded-xl px-4 py-2.5 shadow-lg min-w-[320px]`}
        onClick={clear}
      >
        {toast.msg}
      </div>
    </div>
  );
};

// -------------- helpers --------------
const asNumber = (v) => (typeof v === "number" && !Number.isNaN(v) ? v : null);

const clip = (s, n = 96) => (!s ? "" : s.length > n ? s.slice(0, n - 1) + "…" : s);

// consistent mapper for server fields -> client
const mapServerKeyword = (k) => ({
  id: k.keyword_id, // single source of truth everywhere
  keyword_id: k.keyword_id,
  keyword: k.keyword || "",
  url: k.ranking_url || "",
  position: asNumber(k.ranking_position),
  delta30: asNumber(k.delta_30),
  timestamp: k.timestamp ? new Date(k.timestamp).getTime() : null,
});

// visual helpers
const getDeltaIcon = (d) =>
  d > 0 ? <TrendingUp className="w-4 h-4" /> : d < 0 ? <TrendingDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />;

const getDeltaClasses = (d) =>
  d > 0
    ? "text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200"
    : d < 0
    ? "text-rose-700 bg-rose-50 ring-1 ring-rose-200"
    : "text-slate-600 bg-slate-50 ring-1 ring-slate-200";

// fetch with timeout (guards cold starts / hangs)
const fetchWithTimeout = (url, options = {}, timeoutMs = 12000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
};

// -------------- trend popup (Option 1) --------------
function openTrendWindow({ id, keyword, position }) {
  const w = window.open("", "_blank", "width=980,height=620");
  if (!w) return;

  const safeAPI = API_URL.replace(/"/g, '\\"');
  const safeId = (id || "").replace(/"/g, '\\"');
  const safeKw = (keyword || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>Trend • ${safeKw}</title>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font: 14px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #0b1220; color: #e5e7eb;}
  header { padding: 14px 16px; background: #0f172a; border-bottom: 1px solid #1f2937; display:flex; align-items:center; justify-content:space-between; }
  h1 { font-size: 16px; margin: 0; font-weight: 600; }
  .sub { color:#94a3b8; font-size:12px; }
  #wrap { padding: 16px; }
  #canvas { width: 100%; height: 420px; background: #0b1220; border-radius: 12px; display:block; }
  .note { color:#a1a1aa; margin-top: 8px; font-size:12px;}
  .badge { background:#111827; color:#e5e7eb; border:1px solid #374151; padding:4px 8px; border-radius:999px; font-size:12px; }
  button.refresh{ background:#2563eb; color:white; border:none; padding:8px 12px; border-radius:10px; cursor:pointer; }
  button.refresh:hover{ background:#1d4ed8; }
</style>
</head>
<body>
<header>
  <div>
    <h1>${safeKw}</h1>
    <div class="sub">View: last 30 points • Click or drag to inspect</div>
  </div>
  <div>
    <span class="badge" id="status">Loading…</span>
    <button class="refresh" id="btn">Refresh</button>
  </div>
</header>
<div id="wrap">
  <canvas id="canvas"></canvas>
  <div class="note" id="note"></div>
</div>

<script>
const API_URL = "${safeAPI}";
const KEYWORD_ID = "${safeId}";

// naive DPR-aware canvas sizing
function fitCanvas(c) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = c.clientWidth;
  const cssH = c.clientHeight;
  c.width = Math.max(1, Math.floor(cssW * dpr));
  c.height = Math.max(1, Math.floor(cssH * dpr));
  const g = c.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return g;
}

async function tryFetchHistory() {
  // primary: /keywords/:id/history (array of {timestamp, ranking_position})
  // fallback: /rankings?keyword_id=:id (same-ish shape)
  const headers = { "Accept": "application/json" };
  let res, json;
  try {
    res = await fetch(\`\${API_URL}/keywords/\${KEYWORD_ID}/history\`, { headers });
    if (res.ok && (res.headers.get("content-type")||"").includes("application/json")) {
      json = await res.json();
    }
  } catch(e) {}
  if (!json) {
    try {
      res = await fetch(\`\${API_URL}/rankings?keyword_id=\${KEYWORD_ID}\`, { headers });
      if (res.ok && (res.headers.get("content-type")||"").includes("application/json")) {
        json = await res.json();
      }
    } catch(e) {}
  }
  if (!json) return [];
  const raw = Array.isArray(json) ? json : (json.data || []);
  return raw
    .map(r => ({
      t: r.timestamp ? new Date(r.timestamp).getTime() : null,
      p: typeof r.ranking_position === "number" ? r.ranking_position : null
    }))
    .filter(r => r.t && r.p != null)
    .sort((a,b)=>a.t-b.t)
    .slice(-30);
}

function drawSeries(ctx, canvas, data) {
  // axes + series
  const pad = { l: 48, r: 16, t: 18, b: 30 };
  const W = canvas.clientWidth, H = canvas.clientHeight;
  ctx.clearRect(0,0,W,H);

  if (!data.length) {
    ctx.fillStyle = "#94a3b8";
    ctx.textBaseline = "middle";
    ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText("No history available.", 16, H/2);
    return;
  }

  const xs = data.map(d=>d.t);
  const ys = data.map(d=>d.p);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  // In rankings, lower is better. We invert the Y axis for intuitive up=better.
  const minY = Math.min(...ys, 1);
  const maxY = Math.max(...ys, 50);

  const xToPx = (x) => pad.l + ( (x - minX) / Math.max(1, (maxX - minX)) ) * (W - pad.l - pad.r);
  const yToPx = (y) => pad.t + ((maxY - y) / Math.max(1, (maxY - minY))) * (H - pad.t - pad.b);

  // grid
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 1;
  for (let yTick of [1,5,10,20,30,40,50]) {
    if (yTick < minY || yTick > maxY) continue;
    const y = yToPx(yTick);
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(W - pad.r, y);
    ctx.stroke();

    ctx.fillStyle = "#94a3b8";
    ctx.textBaseline = "middle";
    ctx.font = "12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    ctx.fillText(String(yTick), 8, y);
  }

  // line
  ctx.strokeStyle = "#60a5fa";
  ctx.lineWidth = 2;
  ctx.beginPath();
  data.forEach((d, i) => {
    const x = xToPx(d.t), y = yToPx(d.p);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // points
  ctx.fillStyle = "#93c5fd";
  data.forEach(d => {
    const x = xToPx(d.t), y = yToPx(d.p);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI*2);
    ctx.fill();
  });

  // last point label
  const last = data[data.length - 1];
  if (last) {
    const x = xToPx(last.t), y = yToPx(last.p);
    ctx.fillStyle = "#e5e7eb";
    ctx.font = "12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    ctx.textBaseline = "bottom";
    ctx.fillText(\`Pos \${last.p}\`, x + 8, y - 6);
  }
}

async function render() {
  const status = document.getElementById("status");
  const note = document.getElementById("note");
  const canvas = document.getElementById("canvas");
  const ctx = fitCanvas(canvas);

  status.textContent = "Loading…";
  note.textContent = "";
  let data = [];
  try {
    data = await tryFetchHistory();
  } catch (e) {
    // ignore
  }

  if (!data.length) {
    // fallback: show a flat series if we truly have nothing
    status.textContent = "No history";
    note.textContent = "No history endpoint found or no data yet. Showing placeholder.";
    const now = Date.now();
    const flat = Array.from({length: 10}, (_,i)=>({ t: now - (9-i)*86400000, p: ${Number.isFinite(position) ? position : "10"} }));
    drawSeries(ctx, canvas, flat);
  } else {
    status.textContent = "Loaded";
    const dtFmt = new Intl.DateTimeFormat(undefined,{ year:"numeric", month:"short", day:"2-digit"});
    const start = dtFmt.format(new Date(data[0].t));
    const end = dtFmt.format(new Date(data[data.length-1].t));
    note.textContent = \`Range: \${start} – \${end}\`;
    drawSeries(ctx, canvas, data);
  }
}

window.addEventListener("resize", () => {
  const canvas = document.getElementById("canvas");
  if (!canvas) return;
  fitCanvas(canvas);
  render();
});

document.getElementById("btn").addEventListener("click", render);

render();
</script>
</body>
</html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();
}

// -------------- main --------------
export default function App() {
  const [keywords, setKeywords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ---------- fetch keywords ----------
  const fetchKeywords = async () => {
    setLoading(true);
    try {
      console.time("fetchKeywords");
      const res = await fetchWithTimeout(`${API_URL}/keywords`, { headers: { Accept: "application/json" } }, 12000);

      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        const text = await res.text();
        throw new Error(
          `Unexpected response (status ${res.status}). Content-Type=${ct}. First bytes: ${clip(
            (text || "").replace(/\s+/g, " "),
            60
          )}`
        );
      }

      const json = await res.json();
      const raw = Array.isArray(json) ? json : json.data || [];
      const list = raw.map(mapServerKeyword);
      setKeywords(list);
    } catch (e) {
      console.error(e);
      showToast(`Failed to load keywords: ${e.message || "unknown error"}`, "error");
      setKeywords([]);
    } finally {
      console.timeEnd("fetchKeywords");
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeywords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- computed ----------
  const totalKeywords = keywords.length;

  const avgPosition = useMemo(() => {
    const nums = keywords.map((k) => k.position).filter((n) => n != null);
    if (!nums.length) return null;
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    return Math.round(avg * 10) / 10;
  }, [keywords]);

  const lastUpdated = useMemo(() => {
    const ts = keywords.map((k) => k.timestamp).filter((t) => typeof t === "number");
    if (!ts.length) return null;
    return new Date(Math.max(...ts));
  }, [keywords]);

  // ---------- actions ----------
  const handleDelete = async (kw) => {
    if (!kw?.id) return;
    const yes = window.confirm(`Delete keyword: "${kw.keyword}"? This cannot be undone.`);
    if (!yes) return;

    setRemovingId(kw.id);
    try {
      const res = await fetch(`${API_URL}/keywords/${kw.id}`, { method: "DELETE" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      setKeywords((prev) => prev.filter((k) => k.id !== kw.id));
      showToast("Keyword deleted", "ok");
    } catch (e) {
      console.error(e);
      showToast(`Failed to delete: ${e.message}`, "error");
    } finally {
      setRemovingId(null);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    const raw = newKeyword.trim();
    if (!raw) return;

    setAdding(true);

    // allow multi-line / comma-separated entry
    const rawItems = raw
      .split(/\r?\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);

    // normalize & de-dupe vs existing
    const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
    const existing = new Set(keywords.map((k) => norm(k.keyword)));
    const firstSeen = new Map(); // norm -> original
    for (const s of rawItems) {
      const key = norm(s);
      if (!firstSeen.has(key)) firstSeen.set(key, s);
    }
    const toAdd = Array.from(firstSeen.entries())
      .filter(([key]) => !existing.has(key))
      .map(([, original]) => original);
    const dup = rawItems.length - toAdd.length;

    let ok = 0;
    let fail = 0;
    for (const kw of toAdd) {
      try {
        const res = await fetchWithTimeout(
          `${API_URL}/keywords`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ keyword: kw }),
          },
          12000
        );
        if (!res.ok) {
          fail++;
          continue;
        }
        ok++;
      } catch {
        fail++;
      }
    }

    await fetchKeywords();
    setNewKeyword("");
    setShowAddForm(false);
    setAdding(false);

    showToast(
      `Added ${ok} ${ok === 1 ? "keyword" : "keywords"}${
        dup ? ` • ${dup} duplicate${dup > 1 ? "s" : ""}` : ""
      }${fail ? ` • ${fail} failed` : ""}`,
      fail ? "error" : "ok"
    );
  };

  const handleRefresh = async () => {
    await fetchKeywords();
    showToast("Refreshed.", "ok");
  };

  // -------------- render --------------
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Keyword Rank Tracker</h1>
          <p className="text-slate-600 mt-1">Track keyword rankings for blumenshinelawgroup.com</p>
          <p className="text-slate-400 text-sm mt-1">Rankings update automatically daily at 2:00 AM</p>
          <p className="text-xs text-slate-400 mt-1">
            API: <code className="font-mono">{API_URL}</code> • Build: <code className="font-mono">{BUILD_TAG}</code>
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-slate-200">
            <div className="text-slate-600 text-sm">Total Keywords</div>
            <div className="text-4xl font-semibold mt-1">{totalKeywords}</div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-slate-200">
            <div className="text-slate-600 text-sm">Average Position</div>
            <div className="text-4xl font-semibold mt-1">{avgPosition == null ? "—" : avgPosition}</div>
          </div>
        </div>

        {/* Table Card */}
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
          {/* Card header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-b border-slate-200">
            <div className="flex items-center gap-2 text-slate-600">
              <Clock className="w-4 h-4" />
              <span className="text-sm">
                Last updated:&nbsp;{lastUpdated ? lastUpdated.toLocaleString() : "—"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="primary" onClick={() => setShowAddForm((v) => !v)}>
                <Plus className="w-4 h-4" />
                Add Keyword(s)
              </Button>
              <Button variant="dark" onClick={handleRefresh}>
                <RefreshCw className="w-4 h-4" />
                Update Now
              </Button>
            </div>
          </div>

          {/* Add form */}
          {showAddForm && (
            <div className="px-5 pt-4 pb-2 border-b border-slate-200">
              <form onSubmit={handleAdd} className="space-y-3">
                <label className="block text-sm text-slate-600">Enter one per line or separate with commas:</label>
                <textarea
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  rows={3}
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  placeholder="e.g. chicago bed bug attorney&#10;airport injury lawyer"
                />
                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={adding}>
                    {adding && <RefreshCw className="w-4 h-4 animate-spin" />}
                    Add
                  </Button>
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setNewKeyword("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-slate-600">
                  <th className="text-left font-semibold px-5 py-3 w-[40%]">KEYWORD</th>
                  <th className="text-left font-semibold px-5 py-3 w-[16%]">POSITION</th>
                  <th className="text-left font-semibold px-5 py-3 w-[16%]">Δ30D</th>
                  <th className="text-left font-semibold px-5 py-3 w-[16%]">TREND</th>
                  <th className="text-left font-semibold px-5 py-3 w-[12%]">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {!loading && keywords.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-slate-500">
                      No keywords yet. Click <b>Add Keyword(s)</b> to get started.
                    </td>
                  </tr>
                )}

                {loading && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-slate-500">
                      Fetching rankings from server… (can take ~5–15s on a cold start)
                    </td>
                  </tr>
                )}

                {keywords.map((kw) => (
                  <tr key={kw.id} className="border-t border-slate-200 hover:bg-slate-50/60">
                    {/* Keyword + URL */}
                    <td className="px-5 py-3 align-top">
                      <div className="font-medium text-slate-900">{kw.keyword || "—"}</div>
                      <div className="text-slate-500 text-xs">
                        {kw.url ? (
                          <a
                            href={kw.url}
                            className="underline decoration-dotted underline-offset-2"
                            rel="noreferrer"
                            target="_blank"
                            title={kw.url}
                          >
                            {clip(kw.url, 72)}
                          </a>
                        ) : (
                          "—"
                        )}
                      </div>
                    </td>

                    {/* Position (click to open trend window) */}
                    <td className="px-5 py-3 align-top">
                      <button
                        className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-900 text-white font-semibold hover:bg-black transition-colors"
                        onClick={() => openTrendWindow(kw)}
                        title="View trend"
                      >
                        {kw.position == null ? "—" : kw.position}
                      </button>
                    </td>

                    {/* Delta 30d */}
                    <td className="px-5 py-3 align-top">
                      <Pill className={getDeltaClasses(kw.delta30)}>
                        <span className="mr-1">{getDeltaIcon(kw.delta30)}</span>
                        <span>
                          {kw.delta30 == null ? "0" : kw.delta30 > 0 ? `+${kw.delta30}` : `${kw.delta30}`}
                        </span>
                      </Pill>
                    </td>

                    {/* Trend button */}
                    <td className="px-5 py-3 align-top">
                      <Button size="sm" variant="ghost" onClick={() => openTrendWindow(kw)} title="Open trend window">
                        <TrendingUp className="w-4 h-4" />
                        Trend
                      </Button>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3 align-top">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDelete(kw)}
                        disabled={removingId === kw.id}
                        title="Delete"
                      >
                        {removingId === kw.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        <span className="sr-only">Delete</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      <Toast toast={toast} clear={() => setToast(null)} />
    </div>
  );
}
