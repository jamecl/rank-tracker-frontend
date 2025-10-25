import React, { useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, Search, Plus, Trash2 } from 'lucide-react';

// keep this EXACTLY as '/api'
const API_URL = process.env.REACT_APP_API_URL || '/api';

const RankTracker = () => {
  const [keywords, setKeywords] = useState([]);
  const [selectedKeyword, setSelectedKeyword] = useState(null);
  const [historicalData, setHistoricalData] = useState([]);
  const [loading, setLoading] = useState(true);

  // UI states
  const [showAddForm, setShowAddForm] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [updating, setUpdating] = useState(false);

  // simple toast
  const [toast, setToast] = useState(null); // { msg, type: 'success' | 'error' }
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => { fetchKeywords(); }, []);
  useEffect(() => {
    if (selectedKeyword?.keyword_id) {
      fetchHistoricalData(selectedKeyword.keyword_id);
    } else {
      setHistoricalData([]);
    }
  }, [selectedKeyword]);

  // ------- API -------

  const fetchKeywords = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/keywords`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to fetch keywords');
      const rows = (json.data || []).map((k) => ({
        id: k.keyword_id,
        keyword_id: k.keyword_id,
        keyword: k.keyword,
        position: k.ranking_position ?? 0,
        url: k.ranking_url || '',
        delta30: k.delta_30 ?? 0,
        searchVolume: k.search_volume ?? 0,
        timestamp: k.timestamp ? String(k.timestamp) : null,
      }));
      setKeywords(rows);
      // ensure selected row is in sync
      if (selectedKeyword) {
        const refreshed = rows.find(r => r.keyword_id === selectedKeyword.keyword_id);
        if (refreshed) setSelectedKeyword(refreshed);
      }
    } catch (e) {
      console.error(e);
      showToast(`Failed to load keywords: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistoricalData = async (keywordId) => {
    try {
      const res = await fetch(`${API_URL}/keywords/${keywordId}?days=30`);
      const data = await res.json();
      if (data.success && data.data?.rankings) {
        setHistoricalData(
          data.data.rankings.map(r => ({
            date: r.timestamp,
            position: r.ranking_position,
          })),
        );
      } else {
        setHistoricalData([]);
      }
    } catch {
      setHistoricalData([]);
    }
  };

  const handleUpdateNow = async () => {
    try {
      setUpdating(true);
      const res = await fetch(`${API_URL}/keywords/update`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        showToast('Update started');
        // small refresh after a moment to reflect “Pending/changes”
        setTimeout(fetchKeywords, 1500);
      } else {
        showToast(data?.error || 'Failed to start update', 'error');
      }
    } catch (e) {
      showToast(`Failed to start update: ${e.message}`, 'error');
    } finally {
      setUpdating(false);
    }
  };

  // MULTI-ADD with normalization/dedupe & server add
  const handleAddKeyword = async () => {
    const input = (newKeyword || '').trim();
    if (!input) return;

    setAdding(true);

    const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const existing = new Set(keywords.map(k => norm(k.keyword)));
    const rawItems = input
      .split(/[\r\n,\t]+/)
      .map(s => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

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
    setAdding(false);

    showToast(
      `Added ${ok} ${ok === 1 ? 'keyword' : 'keywords'}`
      + (dup ? ` • ${dup} duplicate${dup > 1 ? 's' : ''}` : '')
      + (fail ? ` • ${fail} failed` : ''),
      fail ? 'error' : 'success',
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

  // ------- helpers / computed -------

  const handleRowClick = (kw) => {
    setSelectedKeyword(kw);
    // smooth scroll to trend panel on small screens
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      const el = document.getElementById('trend-panel');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const getDeltaIcon = (d) => (
    d > 0 ? <TrendingUp className="w-4 h-4 text-green-600" /> :
    d < 0 ? <TrendingDown className="w-4 h-4 text-red-600" /> :
            <Minus className="w-4 h-4 text-gray-400" />
  );

  const getDeltaColor = (d) => (
    d > 0 ? 'text-green-600 bg-green-50' :
    d < 0 ? 'text-red-600 bg-red-50'  : 'text-gray-600 bg-gray-50'
  );

  const sortedKeywords = useMemo(() => {
    return [...keywords].sort((a, b) => {
      const ap = a.position || 9999;
      const bp = b.position || 9999;
      if (ap !== bp) return ap - bp;
      return a.keyword.localeCompare(b.keyword);
    });
  }, [keywords]);

  const avgPosition = useMemo(() => {
    const withPos = keywords.filter(k => (k.position ?? 0) > 0);
    if (withPos.length === 0) return 0;
    return (withPos.reduce((s, k) => s + (k.position || 0), 0) / withPos.length).toFixed(1);
  }, [keywords]);

  const lastUpdated = useMemo(() => {
    const stamps = keywords
      .map(k => (k.timestamp ? Date.parse(k.timestamp) : NaN))
      .filter(n => Number.isFinite(n));
    if (stamps.length === 0) return null;
    const dt = new Date(Math.max(...stamps));
    return dt.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', month: 'numeric', day: 'numeric', year: 'numeric' });
  }, [keywords]);

  // ------- render -------

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading rankings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Keyword Rank Tracker</h1>
          <p className="text-slate-600">Track keyword rankings for blumenshinelawgroup.com</p>
          <p className="text-sm text-slate-500 mt-1">Rankings update automatically daily at 2:00 AM</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-sm p-6 border border-slate-200">
            <div className="text-sm font-medium text-slate-600 mb-1">Total Keywords</div>
            <div className="text-3xl font-bold text-slate-900">{keywords.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6 border border-slate-200">
            <div className="text-sm font-medium text-slate-600 mb-1">Average Position</div>
            <div className="text-3xl font-bold text-slate-900">{avgPosition}</div>
          </div>
        </div>

        {/* Table + Trend */}
        <div className="grid grid-cols-1 lg:grid-cols-2 items-start gap-6">
          {/* Table card */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Keyword Rankings</h2>
              <div className="flex items-center gap-3">
                {lastUpdated && (
                  <span className="hidden md:inline text-sm text-slate-500">
                    Last updated: {lastUpdated}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setShowAddForm(v => !v)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-white bg-blue-600 hover:bg-blue-700"
                  title="Add Keyword(s)"
                >
                  <Plus className="w-4 h-4" />
                  Add Keyword(s)
                </button>
                <button
                  type="button"
                  onClick={handleUpdateNow}
                  disabled={updating}
                  className={`px-4 py-2 rounded-md text-white ${updating ? 'bg-slate-400' : 'bg-slate-900 hover:bg-slate-800'}`}
                  title="Trigger an immediate refresh"
                >
                  {updating ? 'Updating…' : 'Update Now'}
                </button>
              </div>
            </div>

            {/* Add form */}
            {showAddForm && (
              <div className="px-6 py-4 border-b border-slate-200">
                <div className="flex gap-3">
                  <textarea
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        e.preventDefault();
                        handleAddKeyword();
                      }
                    }}
                    placeholder="Enter keywords — one per line or comma-separated"
                    rows={4}
                    className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddKeyword}
                    disabled={adding || !newKeyword.trim()}
                    className={`px-6 py-2 rounded-lg text-white ${adding ? 'bg-slate-400' : 'bg-blue-600 hover:bg-blue-700'}`}
                  >
                    {adding ? 'Adding…' : 'Add'}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-2">Tip: paste from a spreadsheet, or use commas/new lines.</p>
              </div>
            )}

            {/* Table */}
            {keywords.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Search className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg mb-2">No keywords yet</p>
                <p className="text-sm">Add your first keyword to start tracking</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Keyword</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-slate-600 uppercase">Position</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-slate-600 uppercase">Δ30d</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-600 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {sortedKeywords.map((kw) => (
                      <tr
                        key={kw.id}
                        onClick={() => handleRowClick(kw)}
                        className={`cursor-pointer ${selectedKeyword?.id === kw.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                      >
                        <td className="px-6 py-3">
                          <div className="text-sm font-medium text-slate-900">{kw.keyword}</div>
                          <div className="text-xs text-slate-500 mt-1 truncate">
                            {kw.url || '—'}
                          </div>
                        </td>
                        <td className="px-6 py-3 text-center">
                          {kw.position > 0 ? (
                            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-900 text-white text-sm font-semibold">
                              {kw.position}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex items-center justify-center gap-2">
                            {kw.position > 0 ? (
                              <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${getDeltaColor(kw.delta30)}`}>
                                {getDeltaIcon(kw.delta30)} {Math.abs(kw.delta30)}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-sm">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleDeleteKeyword(kw); }}
                              disabled={removingId === kw.keyword_id}
                              className={`inline-flex items-center justify-center w-9 h-9 rounded-md text-white ${removingId === kw.keyword_id ? 'bg-slate-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'}`}
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

          {/* Trend card */}
          <div
            id="trend-panel"
            className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 lg:sticky lg:top-24 h-fit"
          >
            <h2 className="text-xl font-semibold text-slate-900 mb-6">
              {selectedKeyword ? 'Ranking Trend (30 Days)' : 'Select a keyword to view trends'}
            </h2>

            {selectedKeyword ? (
              <>
                <div className="mb-6 p-4 bg-slate-50 rounded-lg">
                  <div className="text-sm font-medium text-slate-600 mb-2">Selected Keyword</div>
                  <div className="text-lg font-semibold text-slate-900 mb-1">{selectedKeyword.keyword}</div>
                  <div className="flex items-center gap-4 text-sm text-slate-600">
                    <span>Current: {selectedKeyword.position > 0 ? `#${selectedKeyword.position}` : 'Pending'}</span>
                    <span className="truncate max-w-[18rem]">URL: {selectedKeyword.url || '—'}</span>
                  </div>
                </div>

                {historicalData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
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
                      <Line
                        type="monotone"
                        dataKey="position"
                        stroke="#2563eb"
                        strokeWidth={2}
                        dot={{ fill: '#2563eb', r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-80 text-slate-400">
                    <div className="text-center">
                      <p>No historical data yet</p>
                      <p className="text-sm mt-2">Check back after the next update</p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-80 text-slate-400">
                <div className="text-center">
                  <Search className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p>Click on a keyword to view its ranking history</p>
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
