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
const RAW_API =
  (process.env.REACT_APP_API_URL || "/api")
    .trim()
    .replace(/\/+$/, ""); // no trailing slash

const API_URL = RAW_API || "/api";

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
const asNumber = (v) =>
  typeof v === "number" && !Number.isNaN(v) ? v : null;

const clip = (s, n = 96) =>
  !s ? "" : s.length > n ? s.slice(0, n - 1) + "…" : s;

const mapServerKeyword = (k) => ({
  id: k.keyword_id, // keep a single source of truth
  keyword_id: k.keyword_id,
  keyword: k.keyword || "",
  url: k.ranking_url || "",
  position: asNumber(k.ranking_position),
  delta30: asNumber(k.delta_30),
  timestamp: k.timestamp ? new Date(k.timestamp).getTime() : null,
});

const getDeltaIcon = (d) =>
  d > 0 ? (
    <TrendingUp className="w-4 h-4" />
  ) : d < 0 ? (
    <TrendingDown className="w-4 h-4" />
  ) : (
    <Minus className="w-4 h-4" />
  );

const getDeltaClasses = (d) =>
  d > 0
    ? "text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200"
    : d < 0
    ? "text-rose-700 bg-rose-50 ring-1 ring-rose-200"
    : "text-slate-600 bg-slate-50 ring-1 ring-slate-200";

// ---------------- Graph Modal ----------------
const Graph = ({ keywordId, closeModal }) => {
  // Fetch graph data based on keywordId (or simulate it for now)
  useEffect(() => {
    // Simulate fetching graph data based on keywordId
    console.log(`Fetching graph data for keyword ID: ${keywordId}`);
  }, [keywordId]);

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={closeModal}>
          X
        </button>
        <div className="modal-body">
          <h3>Graph for Keyword: {keywordId}</h3>
          {/* Placeholder for the actual graph */}
          <div className="graph-placeholder" style={{ height: "300px" }}>
            {/* Example of graph rendering */}
            <p>Graph will go here</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// -------------- main --------------
export default function App() {
  const [keywords, setKeywords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const [toast, setToast] = useState(null);
  const [selectedKeywordId, setSelectedKeywordId] = useState(null);

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ---------- fetch keywords ----------
  const fetchKeywords = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/keywords`, {
        headers: { Accept: "application/json" },
      });
      const json = await res.json();
      const raw = Array.isArray(json) ? json : json.data || [];
      const list = raw.map(mapServerKeyword);
      setKeywords(list);
    } catch (e) {
      console.error(e);
      showToast(`Failed to load keywords: ${e.message || "unknown error"}`, "error");
      setKeywords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeywords();
  }, []);

  const handleDelete = async (kw) => {
    if (!kw?.id) return;
    const yes = window.confirm(`Delete keyword: "${kw.keyword}"?`);
    if (!yes) return;

    setRemovingId(kw.id);
    try {
      const res = await fetch(`${API_URL}/keywords/${kw.id}`, {
        method: "DELETE",
      });
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
    const rawItems = raw.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean);
    const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
    const existing = new Set(keywords.map((k) => norm(k.keyword)));
    const firstSeen = new Map();
    for (const s of rawItems) {
      const key = norm(s);
      if (!firstSeen.has(key)) firstSeen.set(key, s);
    }
    const toAdd = Array.from(firstSeen.entries())
      .filter(([key]) => !existing.has(key))
      .map(([, original]) => original);
    const dup = rawItems.length - toAdd.length;

    let ok = 0, fail = 0;
    for (const kw of toAdd) {
      try {
        const res = await fetch(`${API_URL}/keywords`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyword: kw }),
        });
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
      `Added ${ok} keyword${ok === 1 ? "" : "s"}${
        dup ? ` • ${dup} duplicate${dup > 1 ? "s" : ""}` : ""
      }${fail ? ` • ${fail} failed` : ""}`,
      fail ? "error" : "ok"
    );
  };

  // -------------- render --------------
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <h1 className="text-3xl font-bold">Keyword Rank Tracker</h1>

        {/* Table and actions */}
        <div className="mt-6">
          <div className="mb-6">
            <Button variant="primary" onClick={() => setShowAddForm((v) => !v)}>
              <Plus className="w-4 h-4" />
              Add Keyword(s)
            </Button>
            <Button variant="dark" onClick={handleRefresh}>
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-slate-600">
                  <th className="text-left font-semibold px-5 py-3">Keyword</th>
                  <th className="text-left font-semibold px-5 py-3">Position</th>
                  <th className="text-left font-semibold px-5 py-3">Δ30D</th>
                  <th className="text-left font-semibold px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-slate-500">
                      Loading…
                    </td>
                  </tr>
                ) : keywords.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-slate-500">
                      No keywords yet. Click <b>Add Keyword(s)</b> to get started.
                    </td>
                  </tr>
                ) : (
                  keywords.map((kw) => (
                    <tr key={kw.id} className="border-t border-slate-200">
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-900">{kw.keyword}</div>
                      </td>
                      <td className="px-5 py-3">{kw.position}</td>
                      <td className="px-5 py-3">
                        <Pill className={getDeltaClasses(kw.delta30)}>
                          {getDeltaIcon(kw.delta30)}
                          {kw.delta30 == null ? "0" : kw.delta30 > 0 ? `+${kw.delta30}` : `${kw.delta30}`}
                        </Pill>
                      </td>
                      <td className="px-5 py-3">
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDelete(kw)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedKeywordId(kw.id)}
                        >
                          View Graph
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Graph Modal */}
        {selectedKeywordId && (
          <Graph keywordId={selectedKeywordId} closeModal={() => setSelectedKeywordId(null)} />
        )}

        <Toast toast={toast} clear={() => setToast(null)} />
      </div>
    </div>
  );
}
