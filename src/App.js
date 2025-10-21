import React, { useState, useMemo, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, Search, Plus } from 'lucide-react';

const API_URL = 'https://ranktrakr-production.up.railway.app/api';

const RankTracker = () => {
  const [keywords, setKeywords] = useState([]);
  const [selectedKeyword, setSelectedKeyword] = useState(null);
  const [newKeyword, setNewKeyword] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [historicalData, setHistoricalData] = useState([]);

  useEffect(() => {
    fetchKeywords();
  }, []);

  useEffect(() => {
    if (selectedKeyword) {
      fetchHistoricalData(selectedKeyword.keyword_id);
    }
  }, [selectedKeyword]);

  const fetchKeywords = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/keywords`);
      const data = await response.json();
      if (data.success) {
        const formatted = data.data
          .map((k) => ({
            id: k.keyword_id,
            keyword_id: k.keyword_id,
            keyword: k.keyword,
            position: k.ranking_position || 0,
            url: k.ranking_url || '',
            searchVolume: k.search_volume || 0,
            delta7: k.delta_7 || 0,
            delta30: k.delta_30 || 0,
          }))
          .filter((k) => k.position > 0);
        setKeywords(formatted);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistoricalData = async (keywordId) => {
    try {
      const response = await fetch(`${API_URL}/keywords/${keywordId}?days=30`);
      const data = await response.json();
      if (data.success && data.data.rankings) {
        const formatted = data.data.rankings.map((r) => ({
          date: r.timestamp,
          position: r.ranking_position,
        }));
        setHistoricalData(formatted);
      }
    } catch (error) {
      setHistoricalData([]);
    }
  };

  const handleAddKeyword = async () => {
    if (!newKeyword.trim()) return;

    try {
      const response = await fetch(`${API_URL}/keywords`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: newKeyword }),
      });

      const data = await response.json();
      if (data.success) {
        await fetchKeywords();
        setNewKeyword('');
        setShowAddForm(false);
        alert('Keyword added! Rankings will update tonight at 2 AM.');
      } else if (response.status === 409) {
        alert('This keyword is already being tracked!');
      } else {
        alert(`Error: ${data.error || 'Failed to add keyword'}`);
      }
    } catch (error) {
      alert('Failed to add keyword: ' + error.message);
    }
  };

  const getDeltaIcon = (delta) => {
    if (delta > 0) return <TrendingUp className="w-4 h-4 text-green-600" />;
    if (delta < 0) return <TrendingDown className="w-4 h-4 text-red-600" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  const getDeltaColor = (delta) => {
    if (delta > 0) return 'text-green-600 bg-green-50';
    if (delta < 0) return 'text-red-600 bg-red-50';
    return 'text-gray-600 bg-gray-50';
  };

  const avgPosition = useMemo(() => {
    if (keywords.length === 0) return 0;
    return (
      keywords.reduce((sum, kw) => sum + kw.position, 0) / keywords.length
    ).toFixed(1);
  }, [keywords]);

  const topRanking = useMemo(() => {
    if (keywords.length === 0) return 0;
    return keywords.reduce((min, kw) => (kw.position < min ? kw.position : min), 100);
  }, [keywords]);

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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Keyword Rank Tracker</h1>
          <p className="text-slate-600">Track keyword rankings for blumenshinelawgroup.com</p>
          <p className="text-sm text-slate-500 mt-1">Rankings update automatically daily at 2:00 AM</p>
        </div>

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

        {/* Toggle button */}
        <div className="flex gap-3 mb-6">
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Add Keyword
          </button>
        </div>

        {/* Conditional form */}
        {showAddForm && (
          <div className="bg-white rounded-lg shadow-sm p-6 border border-slate-200 mb-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Add New Keyword</h3>

            <div className="flex gap-3">
              <input
                type="text"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddKeyword();
                  }
                }}
                placeholder="Enter keyword phrase..."
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <button
                type="button"
                onClick={handleAddKeyword}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Add
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">
                        Keyword
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-slate-600 uppercase">
                        Position
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-slate-600 uppercase">
                        Δ30d
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {keywords.map((kw) => (
                      <tr
                        key={kw.id}
                        onClick={() => setSelectedKeyword(kw)}
                        className={`cursor-pointer ${
                          selectedKeyword?.id === kw.id ? 'bg-blue-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-slate-900">{kw.keyword}</div>
                          <div className="text-xs text-slate-500 mt-1">{kw.url}</div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-900 text-white text-sm font-semibold">
                            {kw.position}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${getDeltaColor(
                                kw.delta30
                              )}`}
                            >
                              {getDeltaIcon(kw.delta30)}
                              {Math.abs(kw.delta30)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-6">
              {selectedKeyword ? 'Ranking Trend (30 Days)' : 'Select a keyword to view trends'}
            </h2>

            {selectedKeyword ? (
              <>
                <div className="mb-6 p-4 bg-slate-50 rounded-lg">
                  <div className="text-sm font-medium text-slate-600 mb-2">Selected Keyword</div>
                  <div className="text-lg font-semibold text-slate-900 mb-1">
                    {selectedKeyword.keyword}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-600">
                    <span>Current: #{selectedKeyword.position}</span>
                    <span>Volume: {selectedKeyword.searchVolume.toLocaleString()}/mo</span>
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
                        tickFormatter={(date) =>
                          new Date(date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })
                        }
                      />
                      <YAxis
                        reversed
                        stroke="#64748b"
                        tick={{ fontSize: 12 }}
                        domain={[1, 'dataMax + 5']}
                      />
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
                      <p className="text-sm mt-2">
                        Check back after tonight&apos;s update at 2 AM
                      </p>
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
    </div>
  );
};

export default RankTracker;
