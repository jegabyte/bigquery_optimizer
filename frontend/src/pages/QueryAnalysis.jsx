import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPlus, FiCheckCircle, FiAlertCircle, FiSearch, FiFilter, FiChevronDown, FiEye, FiTrendingUp, FiClock, FiZap, FiTrash2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { getRecentAnalyses, isFirestoreAvailable } from '../services/analysisService';
import ConfirmDialog from '../components/ConfirmDialog';

const QueryAnalysis = () => {
  const navigate = useNavigate();
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, analysisId: null });

  useEffect(() => {
    loadAnalyses();
  }, []);

  const loadAnalyses = async () => {
    try {
      let allAnalyses = [];

      // Load from Firestore API
      const firestoreAnalyses = await getRecentAnalyses({}, 100); // Get up to 100 recent analyses
      
      for (const analysis of firestoreAnalyses) {
        // Get optimization data from various possible locations
        const optimizationData = analysis.stage_data?.optimization || 
                               analysis.stageData?.optimization ||
                               analysis.result?.metadata?.stages?.optimization ||
                               analysis.result?.stageData?.optimization ||
                               analysis.result?.stage_data?.optimization;
        
        // Get report data for additional metrics
        const reportData = analysis.stage_data?.report || 
                         analysis.stageData?.report ||
                         analysis.result?.metadata?.stages?.report ||
                         analysis.result?.stageData?.report ||
                         analysis.result?.stage_data?.report;
        
        const analysisData = {
          id: analysis.id || analysis.analysis_id,
          query: analysis.query || analysis.original_query || analysis.result?.query || '',
          timestamp: analysis.timestamp || analysis.created_at || new Date().toISOString(),
          status: analysis.result?.error ? 'error' : 'completed',
          issues: (() => {
            // Check rule analysis stage for violations
            const ruleAnalysis = analysis.stage_data?.rules || 
                               analysis.stageData?.rules ||
                               analysis.stage_data?.rule_analysis ||
                               analysis.stageData?.rule_analysis ||
                               analysis.result?.metadata?.stages?.rules ||
                               analysis.result?.metadata?.stages?.rule_analysis;
            
            if (ruleAnalysis?.violations_found !== undefined) {
              return ruleAnalysis.violations_found;
            }
            if (ruleAnalysis?.total_issues !== undefined) {
              return ruleAnalysis.total_issues;
            }
            
            // Fallback to other sources
            return analysis.issues_found?.length || analysis.result?.issues?.length || 0;
          })(),
          costReduction: (() => {
            // Check optimization data first
            if (optimizationData?.performance_improvement?.percentage_reduction !== undefined) {
              return `${Math.round(optimizationData.performance_improvement.percentage_reduction)}%`;
            }
            // Check for cost_saved_usd and calculate percentage
            if (optimizationData?.performance_improvement?.cost_saved_usd && 
                optimizationData?.original_metrics?.estimated_cost_usd) {
              const percentage = (optimizationData.performance_improvement.cost_saved_usd / 
                                optimizationData.original_metrics.estimated_cost_usd) * 100;
              return `${Math.round(percentage)}%`;
            }
            // Check report data
            if (reportData?.optimization_summary?.percentage_reduction !== undefined) {
              return `${Math.round(reportData.optimization_summary.percentage_reduction)}%`;
            }
            if (reportData?.executive_summary?.cost_reduction) {
              const costReductionStr = reportData.executive_summary.cost_reduction;
              // Extract percentage from string like "45% reduction"
              const match = costReductionStr.match(/(\d+)%/);
              if (match) {
                return `${match[1]}%`;
              }
            }
            // Fallback to other sources
            if (analysis.savings_percentage) {
              return `${analysis.savings_percentage}%`;
            }
            return '0%';
          })(),
          optimized: analysis.optimization_applied || !!analysis.optimized_query || !!analysis.result?.optimizedQuery,
          performance: (() => {
            // Check for performance_improvement.percentage_reduction
            if (optimizationData?.performance_improvement?.percentage_reduction !== undefined) {
              return `${Math.round(optimizationData.performance_improvement.percentage_reduction)}% reduction`;
            }
            // Check for bytes saved
            if (optimizationData?.performance_improvement?.bytes_saved_formatted) {
              return `${optimizationData.performance_improvement.bytes_saved_formatted} saved`;
            }
            // Check report data
            if (reportData?.optimization_summary?.bytes_saved_formatted) {
              return `${reportData.optimization_summary.bytes_saved_formatted} saved`;
            }
            if (reportData?.executive_summary?.data_reduction) {
              return reportData.executive_summary.data_reduction;
            }
            if (reportData?.executive_summary?.performance_improvement) {
              return reportData.executive_summary.performance_improvement;
            }
            return 'N/A';
          })(),
          dataReduction: analysis.result?.metadata?.stages?.report?.executive_summary?.data_reduction || 'N/A',
          source: 'bigquery'
        };
        
        allAnalyses.push(analysisData);
      }
      
      console.log(`Loaded ${firestoreAnalyses.length} analyses from Firestore`);

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

  const handleDeleteAnalysis = (analysisId) => {
    setDeleteConfirm({ isOpen: true, analysisId });
  };

  const confirmDelete = async () => {
    const analysisId = deleteConfirm.analysisId;
    
    try {
      // Call the delete API
      const response = await fetch(`${import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8001'}/api/analyses/${analysisId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        toast.success('Analysis deleted successfully');
        // Remove from local state
        setAnalyses(prevAnalyses => prevAnalyses.filter(a => a.id !== analysisId));
      } else {
        throw new Error('Failed to delete analysis');
      }
    } catch (error) {
      console.error('Error deleting analysis:', error);
      toast.error('Failed to delete analysis');
    } finally {
      setDeleteConfirm({ isOpen: false, analysisId: null });
    }
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
    const query = analysis.query || '';
    const matchesSearch = query.toLowerCase().includes(searchQuery.toLowerCase());
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
      const aCost = parseInt((a.costReduction || '0%').replace('%', '')) || 0;
      const bCost = parseInt((b.costReduction || '0%').replace('%', '')) || 0;
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Query Analysis</h1>
          <p className="mt-1 text-sm text-gray-600">View and manage all your BigQuery query optimizations</p>
        </div>
        <button
          onClick={handleNewAnalysis}
          className="btn-primary px-3 py-2 flex items-center gap-1.5 text-sm"
        >
          <FiPlus className="h-4 w-4" />
          <span>New Analysis</span>
        </button>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search queries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          
          <div className="flex gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="error">Failed</option>
              <option value="optimized">Optimized</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
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
          <div className="text-center py-8">
            <div className="text-gray-400 mb-4">
              <FiSearch className="h-10 w-10 mx-auto" />
            </div>
            <h3 className="text-base font-medium text-gray-900 mb-1.5">
              {searchQuery || filterStatus !== 'all' ? 'No analyses found' : 'No analyses yet'}
            </h3>
            <p className="text-sm text-gray-600 mb-3">
              {searchQuery || filterStatus !== 'all' 
                ? 'Try adjusting your search or filters' 
                : 'Get started by analyzing your first BigQuery query'}
            </p>
            {!searchQuery && filterStatus === 'all' && (
              <button
                onClick={handleNewAnalysis}
                className="btn-primary px-3 py-1.5 inline-flex items-center gap-1.5 text-sm"
              >
                <FiPlus className="h-3.5 w-3.5" />
                <span>Create First Analysis</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Query
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Issues
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cost Reduction
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Performance
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    When
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAnalyses.map((analysis) => (
                  <tr key={analysis.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {analysis.status === 'completed' ? (
                          <FiCheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <FiAlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                        )}
                        <div className="max-w-sm">
                          <p className="text-xs font-mono text-gray-900 truncate" title={analysis.query}>
                            {truncateQuery(analysis.query)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {analysis.issues > 0 ? (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700">
                          {analysis.issues} {analysis.issues === 1 ? 'issue' : 'issues'}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                          No issues
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        {parseInt(analysis.costReduction) > 0 && (
                          <FiTrendingUp className="h-4 w-4 text-green-500" />
                        )}
                        <span className={`text-xs font-medium ${
                          parseInt(analysis.costReduction) > 0 ? 'text-green-600' : 'text-gray-500'
                        }`}>
                          {analysis.costReduction}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        {analysis.performance !== 'N/A' && (
                          <FiZap className="h-4 w-4 text-blue-500" />
                        )}
                        <span className={`text-xs ${
                          analysis.performance !== 'N/A' ? 'text-blue-600 font-medium' : 'text-gray-500'
                        }`}>
                          {analysis.performance}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <FiClock className="h-4 w-4" />
                        <span>{formatDate(analysis.timestamp)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAnalysisClick(analysis.id)}
                          className="text-primary-600 hover:text-primary-700 font-medium text-xs flex items-center gap-1"
                        >
                          <FiEye className="h-4 w-4" />
                          <span>View</span>
                        </button>
                        <button
                          onClick={() => handleDeleteAnalysis(analysis.id)}
                          className="text-red-600 hover:text-red-700 font-medium text-xs flex items-center gap-1"
                        >
                          <FiTrash2 className="h-4 w-4" />
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

      {/* Results summary */}
      {filteredAnalyses.length > 0 && (
        <div className="text-xs text-gray-600 text-right">
          Showing {filteredAnalyses.length} {filteredAnalyses.length === 1 ? 'analysis' : 'analyses'}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, analysisId: null })}
        onConfirm={confirmDelete}
        title="Delete Analysis"
        message="Are you sure you want to delete this analysis? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
};

export default QueryAnalysis;