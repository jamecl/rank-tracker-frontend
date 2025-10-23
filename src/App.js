import React, { useState, useMemo, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, Search, Plus, Trash2 } from 'lucide-react';

// Keep this EXACTLY as '/api' for Vercel proxying
const API_URL = process.env.REACT_APP_API_URL || '/api';

const RankTracker = () => {
  const [keywords, setKeywords] = useState([]);
  const [selectedKeyword, setSelectedKeyword] = useState(null);
  const [newKeyword, setNewKeyword] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [historicalData, setHistoricalData] = useState([]);

  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');
  const [removingId, setRemovingId] = useState(null);
  const [updating, setUpdating] = useState(false);

  const [toast, setToast] = useState(null); // { msg, type: 'success'|'error' }
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(null), 3500);
  };

  // ---------- data fetchers ----------
  useEffect(() => { fetchKeywords(); }, []);
  useEffect(() => {
    if (selectedKeyword) fetchHistoricalData(selectedKeyword.keyword_id);
  }, [selectedKeyword]);

  const fetchKeywords = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/keywords`);
      const data = await res.json();
      if (data.success) {
        const fromServer = (data.data || []).map(k => ({
          id: k.keyword_id,
          keyword_id: k.keyword_id,
          keyword: k.keyword,
          position: k.ranking_position ?? 0,
          url: k.ranking_url || '',
          searchVolume: k.search_volume || 0,
          delta7: k.delta_7 || 0,
          delta30: k.delta_30 || 0,
          ts: k.timestamp ? new Date(k.timestamp) : null,
        }));

        // keep local "Pending" rows added before the server returns them
        setKeywords(prev => {
          const pending = prev.filter(
            p => p.position === 0 &&
              !fromServer.some(s => s.keyword_id === p.keyword_id || s.keyword === p.keyword)
          );
          return [...pending, ...fromServer];
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistoricalData = async (keywordId) => {
    try {
      const res = await fetch(`${API_URL}/keywords/${keywordId}?days=30`);
      const data = await res.json();
      if (data.success && data.data && Array.isArray(data.data.rankings)) {
        setHistoricalData(
          data.data.rankings.map(r => ({
            date: r.timestamp,
            position: r.ranking_position
          }))
        );
      } else {
        setHistoricalData([]);
      }
    } catch {
      setHistoricalData([]);
    }
  };

  // ---------- helpers ----------
  const getDeltaIcon = (d) =>
    d > 0 ? <TrendingUp className="w-4 h-4 text-green-600" /> :
    d < 0 ? <TrendingDown className="w-4 h-4 text-red-600" /> :
            <Minus className="w-4 h-4 text-gray-400" />;

  const getDeltaColor = (d) =>
    d > 0 ? 'text-green-600 bg-green-50' :
    d < 0 ? 'text-red-600 bg-red-50' : 'text-gray-600 bg-gray-50';

  const avgPosition = useMemo(() => {
    const withPos = keywords.filter(k => (k.position || 0) > 0);
    if (withPos.length === 0) return 0;
    return (withPos.reduce((s, kw) => s + kw.position, 0) / withPos.length).toFixed(1);
  }, [keywords]);

  const topRanking = useMemo(() => {
    const withPos = keywords.filter(k => (k.position || 0) > 0);
    if (withPos.length === 0) return 0;
    return withPos.reduce((min, kw) => (kw.position < min ? kw.position : min), 100);
  }, [keywords]);

  const sortedKeywords = useMemo(() => {
    return [...keywords].sort((a, b) => {
      const ap = a.position || 9999, bp = b.position || 9999;
      if (ap !== bp) return ap - bp;
      return a.keyword.localeCompare(b.keyword);
    });
  }, [keywords]);

  const lastUpdated = useMemo(() => {
    const times = keywords.map(k => k.ts).filter(Boolean);
    if (times.length === 0) return null;
    return new Date(Math.max(...times.map(t => t.getTime())));
  }, [keywords]);

  const fmtLocalDateTime = (d) =>
    d ? d.toLocaleString(undefined, {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: 'numeric', minute: '2-digit'
    }) : '—';

  // ---------- actions ----------
  // Multi-add with dedupe & normalization (commas, newlines, tabs)
  const handleAddKeyword = async () => {
    const input = (newKeyword || '').trim();
    if (!input) return;

    setAddError('');
    setAddSuccess('');
    setAdding(true);

    const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const existing = new Set(keywords.map(k => norm(k.keyword)));

    const rawItems = input
      .split(/[\r\n,\t]+/)
      .map(s => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    // dedupe while preserving first original case
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
        const res = await fetch(`${API_URL}/keywords`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: kw })
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
    setAdding(false);

    showToast(
      `Added ${ok} ${ok === 1 ? 'keyword' : 'keywords'}`
        + (dup ? ` • ${dup} duplicate${dup > 1 ? 's' : ''}` : '')
        + (fail ? ` • ${fail} failed` : ''),
      fail ? 'error' : 'success'
    );
  };

  const handleDeleteKeyword = async (kw) => {
    if (!window.confirm(`Remove "${kw.keyword}" from tracking?`)) return;
    setRemovingId(kw.keyword_id);
    try {
      const res = await fetch(`${API_URL}/keywords/${kw.keyword_id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setKeywords(prev => prev.filter(k => k.keyword_id !== kw.keyword_id));
      if (selectedKeyword?.keyword_id === kw.keyword_id) setSelectedKeyword(null);
      showToast(`Removed "${kw.keyword}"`);
    } catch (e) {
      console.error(e);
      showToast(`Failed to remove keyword: ${e.message}`, 'error');
    } finally {
      setRemovingId(null);
    }
  };

  const handleUpdateNow = async () => {
    try {
      setUpdating(true);
      const res = await fetch(`${API_URL}/keywords/update`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast('Update started. Refreshing shortly…', 'success');

      // Refresh list after a short delay
      setTimeout(fetchKeywords, 2500);
    } catch (e) {
      console.error(e);
      showToast(`Failed to start update: ${e.message}`, 'error');
    } finally {
      setUpdating(false);
    }
  };

  // ---------- UI ----------
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-600 text-sm">Loading rankings…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto p-6">
        {/* Page header */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Keyword Rank Tracker</h1>
          <p className="text-slate-600 text-sm">Track keyword rankings for blumenshinelawgroup.com</p>
          <p className="text-xs text-slate-500 mt-0.5">Rankings update automatically daily at 2:00 AM</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="bg-white rounded-lg shadow-sm p-4 border border-slate-200">
            <div className="text-xs font-medium text-slate-600 mb-0.5">Total Keywords</div>
            <div className="text-2xl font-bold text-slate-900">{keywords.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4 border border-slate-200">
            <div className="text-xs font-medium text-slate-600 mb-0.5">Average Position</div>
            <div className="text-2xl font-bold text-slate-900">{avgPosition}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4 border border-slate-200">
            <div className="text-xs font-medium text-slate-600 mb-0.5">Best Ranking</div>
            <div className="text-2xl font-bold text-slate-900">#{topRanking}</div>
          </div>
        </div>

      
        {/* Add form */}
        {showAddForm && (
          <div className="bg-white rounded-lg shadow-sm p-4 border border-slate-200 mb-4">
            <h3 className="text-base font-semibold text-slate-900 mb-3">Add New Keyword(s)</h3>
            <div className="flex gap-3">
              <textarea
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={(e) => {
                  // Keep Enter for newlines; submit with Ctrl/Cmd + Enter
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleAddKeyword();
                  }
                }}
                placeholder="Enter keywords — one per line or comma-separated"
                rows={4}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <button
                type="button"
                onClick={handleAddKeyword}
                disabled={adding || !newKeyword.trim()}
                className={`px-5 py-2 rounded-lg text-white ${adding ? 'bg-slate-400' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {adding ? 'Adding…' : 'Add'}
              </button>
            </div>
            {addError && <p className="mt-2 text-xs text-red-600">{addError}</p>}
            {addSuccess && <p className="mt-2 text-xs text-green-600">{addSuccess}</p>}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Rankings table */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Keyword Rankings</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-600">
                  Last updated: {fmtLocalDateTime(lastUpdated)}
                </span>
                <button
                  type="button"
                  onClick={handleUpdateNow}
                  disabled={updating}
                  className={`px-3 py-1.5 rounded-md text-white ${updating ? 'bg-slate-400' : 'bg-slate-900 hover:bg-slate-800'}`}
                >
                  {updating ? 'Updating…' : 'Update Now'}
                </button>
              </div>
            </div>

            {keywords.length === 0 ? (
              <div className="p-10 text-center text-slate-400">
                <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-base mb-1">No keywords yet</p>
                <p className="text-sm">Add your first keyword to start tracking</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-xs">
                      <th className="px-3 py-2 text-left font-medium text-slate-600 uppercase tracking-wide">Keyword</th>
                      <th className="px-3 py-2 text-center font-medium text-slate-600 uppercase tracking-wide">Position</th>
                      <th className="px-3 py-2 text-center font-medium text-slate-600 uppercase tracking-wide">Δ30d</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-600 uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-[13px]">
                    {sortedKeywords.map(kw => (
                      <tr
                        key={kw.id}
                        onClick={() => setSelectedKeyword(kw)}
                        className={`cursor-pointer ${selectedKeyword?.id === kw.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                      >
                        <td className="px-3 py-2 leading-tight">
                          <div className="font-medium text-slate-900">{kw.keyword}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[420px]">{kw.url}</div>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {kw.position > 0 ? (
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-900 text-white text-xs font-semibold">
                              {kw.position}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-center gap-1.5">
                            {kw.position > 0 ? (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getDeltaColor(kw.delta30)}`}>
                                {getDeltaIcon(kw.delta30)} {Math.abs(kw.delta30)}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleDeleteKeyword(kw); }}
                              disabled={removingId === kw.keyword_id}
                              className={`inline-flex items-center justify-center w-8 h-8 rounded-md text-white ${removingId === kw.keyword_id ? 'bg-slate-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'}`}
                              title="Remove keyword"
                              aria-label="Remove keyword"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Trend panel */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              {selectedKeyword ? 'Ranking Trend (30 Days)' : 'Select a keyword to view trends'}
            </h2>

            {selectedKeyword ? (
              <>
                <div className="mb-4 p-3 bg-slate-50 rounded-lg">
                  <div className="text-xs font-medium text-slate-600 mb-1">Selected Keyword</div>
                  <div className="text-base font-semibold text-slate-900 mb-0.5">{selectedKeyword.keyword}</div>
                  <div className="flex items-center gap-4 text-xs text-slate-600">
                    <span>Current: #{selectedKeyword.position || '—'}</span>
                    <span>Volume: {Number(selectedKeyword.searchVolume || 0).toLocaleString()}/mo</span>
                  </div>
                </div>

                {historicalData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={historicalData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="date"
                        stroke="#64748b"
                        tick={{ fontSize: 12 }}
                        tickFormatter={(d) =>
                          new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        }
                      />
                      <YAxis reversed stroke="#64748b" tick={{ fontSize: 12 }} domain={[1, 'dataMax + 5']} />
                      <Tooltip />
                      <Line type="monotone" dataKey="position" stroke="#2563eb" strokeWidth={2} dot={{ fill: '#2563eb', r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-64 text-slate-400">
                    <div className="text-center">
                      <p>No historical data yet</p>
                      <p className="text-xs mt-1">Check back after tonight&apos;s update at 2 AM</p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-64 text-slate-400">
                <div className="text-center">
                  <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Click on a keyword to view its ranking history</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg text-white ${
            toast.type === 'error' ? 'bg-red-600' : 'bg-slate-900'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
};

export default RankTracker;
