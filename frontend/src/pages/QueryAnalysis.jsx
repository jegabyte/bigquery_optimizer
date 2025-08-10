import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPlus, FiCheckCircle, FiAlertCircle, FiSearch, FiFilter, FiChevronDown, FiEye, FiTrendingUp, FiClock, FiZap } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { getRecentAnalyses, isFirestoreAvailable } from '../services/analysisService';

const QueryAnalysis = () => {
  const navigate = useNavigate();
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('recent');

  useEffect(() => {
    loadAnalyses();
  }, []);

  const loadAnalyses = async () => {
    try {
      let allAnalyses = [];

      // Primary source: Firestore (cloud storage)
      try {
        const firestoreAvailable = await isFirestoreAvailable();
        if (firestoreAvailable) {
          const firestoreAnalyses = await getRecentAnalyses({}, 100); // Get up to 100 recent analyses
          
          for (const analysis of firestoreAnalyses) {
            const analysisData = {
              id: analysis.id,
              query: analysis.query,
              timestamp: analysis.timestamp || analysis.created_at || new Date().toISOString(),
              status: analysis.result?.error ? 'error' : 'completed',
              issues: analysis.result?.issues?.length || 0,
              costReduction: analysis.result?.metadata?.stages?.report?.executive_summary?.cost_reduction || 
                             analysis.result?.validationResult?.costSavings ? `${analysis.result.validationResult.costSavings}%` : '0%',
              optimized: !!analysis.result?.optimizedQuery,
              performance: analysis.result?.metadata?.stages?.report?.executive_summary?.performance_improvement || 
                          analysis.result?.metadata?.stages?.report?.executive_summary?.performance_gain || 'N/A',
              dataReduction: analysis.result?.metadata?.stages?.report?.executive_summary?.data_reduction || 'N/A',
              source: 'firestore'
            };
            
            allAnalyses.push(analysisData);
          }
          
          console.log(`Loaded ${firestoreAnalyses.length} analyses from Firestore`);
        } else {
          // Fallback to localStorage only if Firestore is unavailable
          console.log('Firestore unavailable, falling back to localStorage');
          
          const allKeys = Object.keys(localStorage);
          const analysisKeys = allKeys.filter(key => key.startsWith('analysis-result-'));
          
          for (const key of analysisKeys) {
            try {
              const data = JSON.parse(localStorage.getItem(key));
              const id = key.replace('analysis-result-', '');
              
              const analysisData = {
                id: id,
                query: data.query,
                timestamp: data.timestamp || new Date().toISOString(),
                status: data.result?.error ? 'error' : 'completed',
                issues: data.result?.issues?.length || 0,
                costReduction: data.result?.metadata?.stages?.report?.executive_summary?.cost_reduction || '0%',
                optimized: !!data.result?.optimizedQuery,
                performance: data.result?.metadata?.stages?.report?.executive_summary?.performance_improvement || 'N/A',
                dataReduction: data.result?.metadata?.stages?.report?.executive_summary?.data_reduction || 'N/A',
                source: 'localstorage'
              };
              
              allAnalyses.push(analysisData);
            } catch (e) {
              console.error('Error parsing localStorage item:', key, e);
            }
          }
          
          console.log(`Loaded ${analysisKeys.length} analyses from localStorage`);
          
          if (analysisKeys.length > 0) {
            toast.info('Loaded analyses from local cache (offline mode)');
          }
        }
      } catch (firestoreError) {
        console.error('Error loading from Firestore:', firestoreError);
        
        // Fallback to localStorage on error
        const allKeys = Object.keys(localStorage);
        const analysisKeys = allKeys.filter(key => key.startsWith('analysis-result-'));
        
        for (const key of analysisKeys) {
          try {
            const data = JSON.parse(localStorage.getItem(key));
            const id = key.replace('analysis-result-', '');
            
            const analysisData = {
              id: id,
              query: data.query,
              timestamp: data.timestamp || new Date().toISOString(),
              status: data.result?.error ? 'error' : 'completed',
              issues: data.result?.issues?.length || 0,
              costReduction: data.result?.metadata?.stages?.report?.executive_summary?.cost_reduction || '0%',
              optimized: !!data.result?.optimizedQuery,
              performance: data.result?.metadata?.stages?.report?.executive_summary?.performance_improvement || 'N/A',
              dataReduction: data.result?.metadata?.stages?.report?.executive_summary?.data_reduction || 'N/A',
              source: 'localstorage'
            };
            
            allAnalyses.push(analysisData);
          } catch (e) {
            console.error('Error parsing localStorage item:', key, e);
          }
        }
        
        toast.warning('Using local cache - cloud storage unavailable');
      }

      // Sort by timestamp (newest first)
      allAnalyses.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setAnalyses(allAnalyses);
      
      console.log(`Total analyses loaded: ${allAnalyses.length}`);
    } catch (error) {
      console.error('Error loading analyses:', error);
      toast.error('Failed to load analyses');
    } finally {
      setLoading(false);
    }
  };

  const handleNewAnalysis = () => {
    const newAnalysisId = 'analysis-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    navigate(`/analysis/${newAnalysisId}/new`);
  };

  const handleAnalysisClick = (analysisId) => {
    navigate(`/analysis/${analysisId}`);
  };

  const truncateQuery = (query, maxLength = 45) => {
    if (query.length <= maxLength) return query;
    return query.substring(0, maxLength) + '...';
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  // Filter and sort analyses
  let filteredAnalyses = analyses.filter(analysis => {
    const matchesSearch = analysis.query.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || 
      (filterStatus === 'completed' && analysis.status === 'completed') ||
      (filterStatus === 'error' && analysis.status === 'error') ||
      (filterStatus === 'optimized' && analysis.optimized);
    return matchesSearch && matchesStatus;
  });

  // Sort analyses
  if (sortBy === 'recent') {
    filteredAnalyses.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } else if (sortBy === 'issues') {
    filteredAnalyses.sort((a, b) => b.issues - a.issues);
  } else if (sortBy === 'cost') {
    filteredAnalyses.sort((a, b) => {
      const aCost = parseInt(a.costReduction.replace('%', '')) || 0;
      const bCost = parseInt(b.costReduction.replace('%', '')) || 0;
      return bCost - aCost;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Query Analysis</h1>
          <p className="mt-2 text-gray-600">View and manage all your BigQuery query optimizations</p>
        </div>
        <button
          onClick={handleNewAnalysis}
          className="btn-primary px-4 py-2.5 flex items-center gap-2"
        >
          <FiPlus className="h-5 w-5" />
          <span>New Analysis</span>
        </button>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Search queries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          
          <div className="flex gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="error">Failed</option>
              <option value="optimized">Optimized</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
            >
              <option value="recent">Most Recent</option>
              <option value="issues">Most Issues</option>
              <option value="cost">Cost Savings</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {filteredAnalyses.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <FiSearch className="h-12 w-12 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchQuery || filterStatus !== 'all' ? 'No analyses found' : 'No analyses yet'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchQuery || filterStatus !== 'all' 
                ? 'Try adjusting your search or filters' 
                : 'Get started by analyzing your first BigQuery query'}
            </p>
            {!searchQuery && filterStatus === 'all' && (
              <button
                onClick={handleNewAnalysis}
                className="btn-primary px-4 py-2 inline-flex items-center gap-2"
              >
                <FiPlus className="h-4 w-4" />
                <span>Create First Analysis</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Query
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Issues
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cost Reduction
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Performance
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    When
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAnalyses.map((analysis) => (
                  <tr key={analysis.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {analysis.status === 'completed' ? (
                          <FiCheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <FiAlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                        )}
                        <div className="max-w-sm">
                          <p className="text-sm font-mono text-gray-900 truncate" title={analysis.query}>
                            {truncateQuery(analysis.query)}
                          </p>
                        </div>
                        {analysis.optimized && (
                          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700 flex-shrink-0">
                            Optimized
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {analysis.issues > 0 ? (
                        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700">
                          {analysis.issues} {analysis.issues === 1 ? 'issue' : 'issues'}
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">
                          No issues
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        {parseInt(analysis.costReduction) > 0 && (
                          <FiTrendingUp className="h-4 w-4 text-green-500" />
                        )}
                        <span className={`text-sm font-medium ${
                          parseInt(analysis.costReduction) > 0 ? 'text-green-600' : 'text-gray-500'
                        }`}>
                          {analysis.costReduction}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        {analysis.performance !== 'N/A' && (
                          <FiZap className="h-4 w-4 text-blue-500" />
                        )}
                        <span className={`text-sm ${
                          analysis.performance !== 'N/A' ? 'text-blue-600 font-medium' : 'text-gray-500'
                        }`}>
                          {analysis.performance}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <FiClock className="h-4 w-4" />
                        <span>{formatDate(analysis.timestamp)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleAnalysisClick(analysis.id)}
                        className="text-primary-600 hover:text-primary-700 font-medium text-sm flex items-center gap-1"
                      >
                        <FiEye className="h-4 w-4" />
                        <span>View</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Results summary */}
      {filteredAnalyses.length > 0 && (
        <div className="text-sm text-gray-600 text-right">
          Showing {filteredAnalyses.length} {filteredAnalyses.length === 1 ? 'analysis' : 'analyses'}
        </div>
      )}
    </div>
  );
};

export default QueryAnalysis;