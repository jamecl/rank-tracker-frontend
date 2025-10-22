import React, { useState, useMemo, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, Search, Plus, Trash2 } from 'lucide-react';

// Keep this EXACTLY as '/api' so Vercel rewrites to the backend
const API_URL = process.env.REACT_APP_API_URL || '/api';

function RankTracker() {
  const [keywords, setKeywords] = useState([]);
  const [selectedKeyword, setSelectedKeyword] = useState(null);
  const [newKeyword, setNewKeyword] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [historicalData, setHistoricalData] = useState([]);

  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const [toast, setToast] = useState(null); // { msg, type: 'success'|'error' }
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Fetch list on load
  useEffect(() => { fetchKeywords(); }, []);
  // Fetch chart data when a keyword is selected
  useEffect(() => { if (selectedKeyword) fetchHistoricalData(selectedKeyword.keyword_id); }, [selectedKeyword]);

  async function fetchKeywords() {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/keywords`);
      const data = await res.json();

      if (data?.success) {
        const fromServer = (data.data || []).map((k) => ({
          id: k.keyword_id,
          keyword_id: k.keyword_id,
          keyword: k.keyword,
          position: k.ranking_position ?? 0,
          url: k.ranking_url || '',
          searchVolume: k.search_volume || 0,
          delta7: k.delta_7 || 0,
          delta30: k.delta_30 || 0,
          timestamp: k.timestamp || null
        }));

        // keep local "Pending" rows the server doesn't yet return
        setKeywords((prev) => {
          const pending = prev.filter(
            (p) =>
              p.position === 0 &&
              !fromServer.some((s) => s.keyword_id === p.keyword_id || s.keyword === p.keyword)
          );
          return [...pending, ...fromServer];
        });
      }
    } catch (e) {
      console.error('fetchKeywords error:', e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchHistoricalData(keywordId) {
    try {
      const res = await fetch(`${API_URL}/keywords/${keywordId}?days=30`);
      const data = await res.json();
      if (data?.success && data.data?.rankings) {
        setHistoricalData(
          data.data.rankings.map((r) => ({
            date: r.timestamp,
            position: r.ranking_position
          }))
        );
      } else {
        setHistoricalData([]);
      }
    } catch (e) {
      console.error('fetchHistoricalData error:', e);
      setHistoricalData([]);
    }
  }

  // MULTI-ADD with duplicate precheck (handles lines/commas/tabs; normalizes spacing/case)
  async function handleAddKeyword() {
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
    let ok = 0;
    let fail = 0;

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
  }

  async function handleDeleteKeyword(kw) {
    if (!window.confirm(`Remove "${kw.keyword}" from tracking?`)) return;
    setRemovingId(kw.keyword_id);
    try {
      const res = await fetch(`${API_URL}/keywords/${kw.keyword_id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setKeywords((prev) => prev.filter((k) => k.keyword_id !== kw.keyword_id));
      if (selectedKeyword?.keyword_id === kw.keyword_id) setSelectedKeyword(null);
      showToast(`Removed "${kw.keyword}"`);
    } catch (e) {
      console.error(e);
      showToast(`Failed to remove keyword: ${e.message}`, 'error');
    } finally {
      setRemovingId(null);
    }
  }

  async function handleUpdateNow() {
    try {
      setRefreshing(true);
      const res = await fetch(`${API_URL}/keywords/update`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast('Rankings refreshed');
      await fetchKeywords();
    } catch (e) {
      console.error(e);
      showToast(`Refresh failed: ${e.message}`, 'error');
    } finally {
      setRefreshing(false);
    }
  }

  // Helpers
  const getDeltaIcon = (d) =>
    d > 0 ? <TrendingUp className="w-4 h-4 text-green-600" /> :
    d < 0 ? <TrendingDown className="w-4 h-4 text-red-600" /> :
            <Minus className="w-4 h-4 text-gray-400" />;

  const getDeltaColor = (d) =>
    d > 0 ? 'text-green-600 bg-green-50' :
    d < 0 ? 'text-red-600 bg-red-50' : 'text-gray-600 bg-gray-50';

  const avgPosition = useMemo(() => {
    const withPos = keywords.filter((k) => k.position > 0);
    if (withPos.length === 0) return 0;
    return (withPos.reduce((s, kw) => s + kw.position, 0) / withPos.length).toFixed(1);
  }, [keywords]);

  const topRanking = useMemo(() => {
    const withPos = keywords.filter((k) => k.position > 0);
    if (withPos.length === 0) return 0;
    return withPos.reduce((min, kw) => (kw.position < min ? kw.position : min), 100);
  }, [keywords]);

  const sortedKeywords = useMemo(() => {
    return [...keywords].sort((a, b) => {
      const ap = a.position || 9999;
      const bp = b.position || 9999;
      if (ap !== bp) return ap - bp;
      return a.keyword.localeCompare(b.keyword);
    });
  }, [keywords]);

  const lastUpdated = useMemo(() => {
    const dts = keywords
      .map(k => k.timestamp ? new Date(k.timestamp) : null)
      .filter(Boolean);
    if (dts.length === 0) return null;
    const max = new Date(Math.max(...dts.map(d => d.getTime())));
    return max;
  }, [keywords]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
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

        {/* Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm p-6 border border-slate-200">
            <div className="text-sm font-medium text-slate-600 mb-1">Total Keywords</div>
            <div className="text-3xl font-bold text-slate-900">{keywords.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6 border border-slate-200">
            <div className="text-sm font-medium text-slate-600 mb-1">Average Position</div>
            <div className="text-3xl font-bold text-slate-900">{avgPosition}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6 border border-slate-200">
            <div className="text-sm font-medium text-slate-600 mb-1">Best Ranking</div>
            <div className="text-3xl font-bold text-slate-900">#{topRanking}</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <button
            type="button"
            onClick={() => setShowAddForm(v => !v)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> Add Keyword(s)
          </button>

          <button
            type="button"
            onClick={handleUpdateNow}
            disabled={refreshing}
            className={`px-4 py-2 rounded-lg text-white ${refreshing ? 'bg-slate-400' : 'bg-slate-800 hover:bg-slate-900'}`}
            title="Trigger an immediate ranking refresh"
          >
            {refreshing ? 'Updating…' : 'Update Now'}
          </button>

          {lastUpdated && (
            <span className="ml-auto text-sm text-slate-500">
              Last updated:{' '}
              {lastUpdated.toLocaleString(undefined, {
                month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
              })}
            </span>
          )}
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="bg-white rounded-lg shadow-sm p-6 border border-slate-200 mb-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Add New Keyword(s)</h3>
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
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Table */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-xl font-semibold text-slate-900">Keyword Rankings</h2>
            </div>

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
                        key={kw.keyword_id || kw.id}
                        onClick={() => setSelectedKeyword(kw)}
                        className={`cursor-pointer ${selectedKeyword?.keyword_id === kw.keyword_id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                      >
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-slate-900">{kw.keyword}</div>
                          <div className="text-xs text-slate-500 mt-1">{kw.url}</div>
                        </td>
                        <td className="px-6 py-4 text-center">
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
                        <td className="px-6 py-4">
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
                        <td className="px-6 py-4">
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleDeleteKeyword(kw); }}
                              disabled={removingId === kw.keyword_id}
                              className={`inline-flex items-center justify-center w-9 h-9 rounded-md text-white ${
                                removingId === kw.keyword_id ? 'bg-slate-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'
                              }`}
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

          {/* Chart */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-6">
              {selectedKeyword ? 'Ranking Trend (30 Days)' : 'Select a keyword to view trends'}
            </h2>

            {selectedKeyword ? (
              <>
                <div className="mb-6 p-4 bg-slate-50 rounded-lg">
                  <div className="text-sm font-medium text-slate-600 mb-2">Selected Keyword</div>
                  <div className="text-lg font-semibold text-slate-900 mb-1">{selectedKeyword.keyword}</div>
                  <div className="flex items-center gap-4 text-sm text-slate-600">
                    <span>Current: #{selectedKeyword.position}</span>
                    <span>Volume: {Number(selectedKeyword.searchVolume || 0).toLocaleString()}/mo</span>
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
                        tickFormatter={(d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      />
                      <YAxis reversed stroke="#64748b" tick={{ fontSize: 12 }} domain={[1, 'dataMax + 5']} />
                      <Tooltip />
                      <Line type="monotone" dataKey="position" stroke="#2563eb" strokeWidth={2} dot={{ fill: '#2563eb', r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-80 text-slate-400">
                    <div className="text-center">
                      <p>No historical data yet</p>
                      <p className="text-sm mt-2">Check back after tonight&apos;s update at 2 AM</p>
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
}

export default RankTracker;
