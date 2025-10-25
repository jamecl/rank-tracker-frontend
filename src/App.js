// src/App.js
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Plus, Trash2, RefreshCw, Loader2, TrendingUp, TrendingDown, Minus
} from 'lucide-react';

// If you deploy with CRA on Vercel, set REACT_APP_API_URL. Otherwise, leave empty for same-origin.
const API_URL = process.env.REACT_APP_API_URL || '';

function formatDate(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return String(ts);
  }
}

function classNames(...xs) {
  return xs.filter(Boolean).join(' ');
}

// Ranks: smaller is better (1 is best).
// A negative delta means improved rank (moved up), positive = declined.
function DeltaBadge({ delta }) {
  if (delta === null || delta === undefined) return <span className="text-slate-400">—</span>;
  const val = Number(delta);
  if (Number.isNaN(val)) return <span className="text-slate-400">—</span>;

  if (val < 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-green-50 text-green-700">
        <TrendingUp className="w-3.5 h-3.5" />
        {Math.abs(val)}
      </span>
    );
  }
  if (val > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-red-50 text-red-700">
        <TrendingDown className="w-3.5 h-3.5" />
        {val}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-slate-50 text-slate-600">
      <Minus className="w-3.5 h-3.5" /> 0
    </span>
  );
}

export default function App() {
  const [rows, setRows] = useState([]);               // normalized keywords list
  const [loading, setLoading] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');

  const [selectedId, setSelectedId] = useState(null);
  const [selectedKeyword, setSelectedKeyword] = useState(null);
  const [historical, setHistorical] = useState([]);   // [{ts, pos}...]

  const [updating, setUpdating] = useState(false);    // “Update Now” spinner
  const [toast, setToast] = useState(null);

  const lastUpdated = useMemo(() => {
    const maxTs = rows.reduce((acc, r) => {
      if (!r.timestamp) return acc;
      const t = new Date(r.timestamp).getTime();
      return Math.max(acc, t);
    }, 0);
    return maxTs ? new Date(maxTs).toISOString() : null;
  }, [rows]);

  const showToast = useCallback((msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // -------- API helpers --------
  const fetchKeywords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/keywords`);
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || `Failed to load: ${res.status}`);
      }

      // Normalize server fields -> UI fields
      // Server: keyword_id, keyword, target_domain, ranking_position, ranking_url, timestamp, delta_7, delta_30
      const normalized = (json.data || []).map(k => ({
        id: k.keyword_id,
        keyword: k.keyword,
        domain: k.target_domain,
        position: k.ranking_position ?? null,
        url: k.ranking_url ?? '',
        timestamp: k.timestamp ?? null,
        delta7: k.delta_7 ?? null,
        delta30: k.delta_30 ?? null,
      }));

      setRows(normalized);
    } catch (e) {
      console.error(e);
      showToast(`Failed to load keywords: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const fetchHistory = useCallback(async (id, days = 30) => {
    if (!id) return;
    try {
      const res = await fetch(`${API_URL}/api/keywords/${id}?days=${days}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Failed to load history: ${res.status}`);
      }
      // Expect: { data: { keyword, rankings: [{ timestamp, ranking_position }, ...] } }
      const pts = (json.data?.rankings || [])
        .filter(r => r.timestamp && (r.ranking_position ?? null) !== null)
        .map(r => ({
          ts: new Date(r.timestamp).getTime(),
          pos: Number(r.ranking_position)
        }))
        .sort((a, b) => a.ts - b.ts);

      setSelectedKeyword(json.data?.keyword || null);
      setHistorical(pts);
    } catch (e) {
      console.error(e);
      setSelectedKeyword(null);
      setHistorical([]);
      showToast(`Failed to load history: ${e.message}`, 'error');
    }
  }, [showToast]);

  // initial load
  useEffect(() => {
    fetchKeywords();
  }, [fetchKeywords]);

  // -------- actions --------
  const handleSelectRow = (row) => {
    setSelectedId(row.id);
    fetchHistory(row.id, 30);
  };

  const handleDelete = async (e, row) => {
    e.stopPropagation();
    if (!row?.id) return;

    setRemovingId(row.id);
    try {
      const res = await fetch(`${API_URL}/api/keywords/${row.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Delete failed (${res.status})`);
      }
      setRows(prev => prev.filter(r => r.id !== row.id));
      if (selectedId === row.id) {
        setSelectedId(null);
        setSelectedKeyword(null);
        setHistorical([]);
      }
      showToast(`Deleted “${row.keyword}”`, 'success');
    } catch (e2) {
      console.error(e2);
      showToast(`Delete failed: ${e2.message}`, 'error');
    } finally {
      setRemovingId(null);
    }
  };

  const handleUpdateNow = async () => {
    setUpdating(true);
    try {
      const res = await fetch(`${API_URL}/api/keywords/update`, { method: 'POST' });
      const ok = res.ok;
      // refresh the table shortly after
      setTimeout(fetchKeywords, 1500);
      showToast(ok ? 'Ranking update started' : 'Update request failed', ok ? 'success' : 'error');
    } catch (e) {
      console.error(e);
      showToast(`Update failed: ${e.message}`, 'error');
    } finally {
      setUpdating(false);
    }
  };

  const handleAddKeywords = async () => {
    const raw = (newKeyword || '').trim();
    if (!raw) {
      setShowAddForm(false);
      return;
    }

    setAdding(true);
    try {
      // split by newline or comma
      const rawItems = raw
        .split(/\r?\n|,/g)
        .map(s => s.trim())
        .filter(Boolean);

      // existing normalized set (lowercased & collapsed spaces)
      const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

      const existing = new Set(rows.map(r => norm(r.keyword)));

      const firstSeen = new Map(); // norm -> original
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
          const res = await fetch(`${API_URL}/api/keywords`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keyword: kw }),
          });
          if (!res.ok) { fail++; continue; }
          ok++;
        } catch {
          fail++;
        }
      }

      await fetchKeywords();
      setNewKeyword('');
      setShowAddForm(false);

      showToast(
        `Added ${ok} ${ok === 1 ? 'keyword' : 'keywords'}`
          + (dup ? ` • ${dup} duplicate${dup > 1 ? 's' : ''}` : '')
          + (fail ? ` • ${fail} failed` : ''),
        fail ? 'error' : 'success'
      );
    } finally {
      setAdding(false);
    }
  };

  // -------- sparkline (simple inline SVG) --------
  const Sparkline = ({ points, height = 40 }) => {
    if (!points?.length) return <div className="text-xs text-slate-400">No history</div>;

    const w = Math.max(100, points.length * 14); // simple width scale
    const xs = points.map((p, i) => (w / (points.length - 1 || 1)) * i);
    const ys = (() => {
      const vals = points.map(p => p.pos);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      if (min === max) {
        return points.map(() => height / 2);
      }
      // invert: lower rank (1) is higher on the chart
      return points.map(p => {
        const t = (p.pos - min) / (max - min);
        return (1 - t) * (height - 6) + 3;
      });
    })();

    const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');

    return (
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full h-10">
        <path d={d} fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-600" />
      </svg>
    );
  };

  // -------- UI --------
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-900">RankTrakr</h1>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddForm(v => !v)}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 text-white px-3 py-1.5 text-sm hover:bg-slate-800"
            >
              <Plus className="w-4 h-4" /> Add Keyword(s)
            </button>

            <button
              onClick={handleUpdateNow}
              disabled={updating}
              className={classNames(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm border',
                updating ? 'bg-slate-100 text-slate-500' : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200'
              )}
            >
              {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Update Now
            </button>
          </div>
        </div>
      </header>

      {/* Add form */}
      {showAddForm && (
        <div className="border-b border-slate-200 bg-white">
          <div className="max-w-6xl mx-auto px-4 py-3">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Add one or more keywords (comma or newline separated)
            </label>
            <textarea
              value={newKeyword}
              onChange={e => setNewKeyword(e.target.value)}
              placeholder="e.g. chicago car accident lawyer&#10;airport injury"
              className="w-full rounded-md border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm p-2"
              rows={3}
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={handleAddKeywords}
                disabled={adding}
                className={classNames(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm',
                  adding ? 'bg-slate-200 text-slate-500' : 'bg-blue-600 text-white hover:bg-blue-700'
                )}
              >
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add
              </button>
              <button
                onClick={() => { setShowAddForm(false); setNewKeyword(''); }}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm border bg-white hover:bg-slate-50 border-slate-200 text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selected details (simple, above table for reliability) */}
      {selectedId && (
        <div className="border-b border-slate-200 bg-white">
          <div className="max-w-6xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-500">Selected keyword</div>
                <div className="text-base font-semibold text-slate-900">
                  {rows.find(r => r.id === selectedId)?.keyword || '—'}
                </div>
              </div>
              <div className="text-sm text-slate-500">
                History (last 30 days)
              </div>
            </div>
            <div className="mt-2">
              <Sparkline points={historical} />
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <main className="max-w-6xl mx-auto px-4 py-4">
        <div className="mb-3 text-xs text-slate-500">
          Last updated: {lastUpdated ? formatDate(lastUpdated) : '—'}
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left font-medium px-3 py-2">Keyword</th>
                <th className="text-left font-medium px-3 py-2">URL</th>
                <th className="text-right font-medium px-3 py-2">Position</th>
                <th className="text-right font-medium px-3 py-2">30d Δ</th>
                <th className="text-right font-medium px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading && (
                <tr>
                  <td colSpan="5" className="px-3 py-6 text-center text-slate-500">
                    <Loader2 className="w-5 h-5 inline-block animate-spin mr-2" />
                    Loading…
                  </td>
                </tr>
              )}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan="5" className="px-3 py-6 text-center text-slate-500">
                    No keywords yet. Click <span className="font-medium">Add Keyword(s)</span> to get started.
                  </td>
                </tr>
              )}

              {!loading && rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => handleSelectRow(row)}
                  className={classNames(
                    'hover:bg-slate-50 cursor-pointer',
                    selectedId === row.id ? 'bg-blue-50/40' : ''
                  )}
                >
                  <td className="px-3 py-2">
                    <div className="text-slate-900">{row.keyword}</div>
                    <div className="text-[11px] text-slate-500">{row.domain}</div>
                  </td>

                  <td className="px-3 py-2 max-w-[420px]">
                    {row.url ? (
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline break-all"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.url}
                      </a>
                    ) : <span className="text-slate-400">—</span>}
                  </td>

                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.position != null ? row.position : <span className="text-slate-400">—</span>}
                    </td>

                  <td className="px-3 py-2 text-right">
                    <DeltaBadge delta={row.delta30} />
                  </td>

                  <td className="px-3 py-2">
                    <div className="flex justify-end">
                      <button
                        onClick={(e) => handleDelete(e, row)}
                        disabled={removingId === row.id}
                        title="Delete keyword"
                        className={classNames(
                          'inline-flex items-center justify-center rounded-md border px-2 py-1.5',
                          'hover:bg-red-50',
                          removingId === row.id
                            ? 'border-slate-200 text-slate-400 bg-slate-50'
                            : 'border-slate-200 text-slate-700'
                        )}
                      >
                        {removingId === row.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

            </tbody>
          </table>
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50">
          <div
            className={classNames(
              'rounded-md px-3 py-2 text-sm shadow',
              toast.type === 'error' ? 'bg-red-600 text-white' :
              toast.type === 'success' ? 'bg-green-600 text-white' :
              'bg-slate-900 text-white'
            )}
          >
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}
