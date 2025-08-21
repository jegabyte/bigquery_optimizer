import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiDatabase,
  FiHardDrive,
  FiDollarSign,
  FiActivity,
  FiClock,
  FiAlertTriangle,
  FiCheckCircle,
  FiInfo,
  FiFilter,
  FiRefreshCw,
  FiDownload,
  FiChevronLeft,
  FiChevronRight,
  FiX,
  FiLayers,
  FiGrid
} from 'react-icons/fi';
import { projectsApiService } from '../../services/projectsApiService';
import toast from 'react-hot-toast';

const TableDetailsModal = ({ table, isOpen, onClose }) => {
  if (!isOpen || !table) return null;

  // Calculate optimization suggestions
  const suggestions = [];
  if (!table.is_partitioned && table.total_logical_gb > 1) {
    suggestions.push({ type: 'warning', text: 'Consider partitioning this large table' });
  }
  if (!table.is_clustered && table.total_queries_6m > 100) {
    suggestions.push({ type: 'info', text: 'Consider clustering for better query performance' });
  }
  if (table.total_queries_6m === 0) {
    suggestions.push({ type: 'warning', text: 'Unused table - consider archiving or deletion' });
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-800 dark:to-blue-900 p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <FiDatabase className="h-6 w-6" />
                  {table.table_name}
                </h2>
                <p className="text-blue-100 text-sm mt-1">{table.full_table_name}</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <FiX className="h-5 w-5 text-white" />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto max-h-[calc(90vh-100px)]">
            {/* Key Metrics Cards */}
            <div className="grid grid-cols-4 gap-4 p-6 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Total Storage</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                      {formatBytes(table.total_logical_gb)}
                    </p>
                  </div>
                  <FiHardDrive className="h-8 w-8 text-blue-500 opacity-50" />
                </div>
              </div>
              
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Monthly Cost</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                      {formatCost(table.active_storage_cost_monthly_usd + table.long_term_storage_cost_monthly_usd)}
                    </p>
                  </div>
                  <FiDollarSign className="h-8 w-8 text-green-500 opacity-50" />
                </div>
              </div>
              
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Total Queries</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                      {table.total_queries_6m.toLocaleString()}
                    </p>
                  </div>
                  <FiActivity className="h-8 w-8 text-purple-500 opacity-50" />
                </div>
              </div>
              
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Table Age</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                      {table.table_age_days}d
                    </p>
                  </div>
                  <FiClock className="h-8 w-8 text-orange-500 opacity-50" />
                </div>
              </div>
            </div>

            {/* Optimization Suggestions */}
            {suggestions.length > 0 && (
              <div className="mx-6 mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-2 flex items-center gap-2">
                  <FiAlertTriangle className="h-4 w-4" />
                  Optimization Opportunities
                </h3>
                <ul className="space-y-1">
                  {suggestions.map((suggestion, idx) => (
                    <li key={idx} className="text-sm text-yellow-700 dark:text-yellow-300 flex items-start gap-2">
                      <span className="text-yellow-500 mt-0.5">•</span>
                      {suggestion.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="p-6 space-y-6">
              {/* Two Column Layout */}
              <div className="grid grid-cols-2 gap-6">
                {/* Basic Information */}
                <div className="bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                    <FiInfo className="h-4 w-4 text-blue-500" />
                    Basic Information
                  </h3>
                  <dl className="space-y-3">
                    <div className="flex justify-between">
                      <dt className="text-sm text-gray-500 dark:text-gray-400">Dataset</dt>
                      <dd className="text-sm font-medium text-gray-900 dark:text-gray-100">{table.dataset_id}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm text-gray-500 dark:text-gray-400">Table Type</dt>
                      <dd className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200">
                          {table.table_type || 'BASE TABLE'}
                        </span>
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm text-gray-500 dark:text-gray-400">Created</dt>
                      <dd className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {table.table_creation_time ? new Date(table.table_creation_time).toLocaleDateString() : 'Unknown'}
                      </dd>
                    </div>
                    {table.table_description && (
                      <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                        <dt className="text-sm text-gray-500 dark:text-gray-400 mb-1">Description</dt>
                        <dd className="text-sm text-gray-700 dark:text-gray-300">{table.table_description}</dd>
                      </div>
                    )}
                  </dl>
                </div>

                {/* Partitioning & Clustering */}
                <div className="bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                    <FiLayers className="h-4 w-4 text-purple-500" />
                    Partitioning & Clustering
                  </h3>
                  <dl className="space-y-3">
                    <div className="flex justify-between items-center">
                      <dt className="text-sm text-gray-500 dark:text-gray-400">Partitioned</dt>
                      <dd className="text-sm font-medium">
                        {table.is_partitioned ? (
                          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                            <FiCheckCircle className="h-4 w-4" />
                            {table.partition_field}
                          </span>
                        ) : (
                          <span className="text-gray-400">No</span>
                        )}
                      </dd>
                    </div>
                    {table.is_partitioned && (
                      <div className="flex justify-between">
                        <dt className="text-sm text-gray-500 dark:text-gray-400">Require Filter</dt>
                        <dd className="text-sm font-medium">
                          {table.require_partition_filter ? (
                            <span className="text-green-600 dark:text-green-400">Yes</span>
                          ) : (
                            <span className="text-orange-600 dark:text-orange-400">No</span>
                          )}
                        </dd>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <dt className="text-sm text-gray-500 dark:text-gray-400">Clustered</dt>
                      <dd className="text-sm font-medium">
                        {table.is_clustered ? (
                          <span className="text-green-600 dark:text-green-400">
                            <FiCheckCircle className="h-4 w-4 inline mr-1" />
                            Yes
                          </span>
                        ) : (
                          <span className="text-gray-400">No</span>
                        )}
                      </dd>
                    </div>
                    {table.is_clustered && table.cluster_fields_raw && (
                      <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                        <dt className="text-sm text-gray-500 dark:text-gray-400 mb-1">Cluster Fields</dt>
                        <dd className="text-sm font-mono text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 p-2 rounded">
                          {table.cluster_fields_raw}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>

              {/* Storage Details */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                  <FiHardDrive className="h-4 w-4 text-blue-500" />
                  Storage Details
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {formatBytes(table.active_logical_gb)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Active Storage</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                      {formatCost(table.active_storage_cost_monthly_usd)}/mo
                    </p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {formatBytes(table.long_term_logical_gb)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Long-term Storage</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                      {formatCost(table.long_term_storage_cost_monthly_usd)}/mo
                    </p>
                  </div>
                  <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {formatBytes(table.total_logical_gb)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Total Storage</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5 font-medium">
                      {formatCost(table.active_storage_cost_monthly_usd + table.long_term_storage_cost_monthly_usd)}/mo
                    </p>
                  </div>
                </div>
              </div>

              {/* Usage Statistics */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                  <FiActivity className="h-4 w-4 text-purple-500" />
                  Usage Statistics (Last 6 Months)
                </h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <dt className="text-sm text-gray-500 dark:text-gray-400">Total Queries</dt>
                      <dd className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {table.total_queries_6m.toLocaleString()}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm text-gray-500 dark:text-gray-400">Unique Users</dt>
                      <dd className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {table.unique_users_6m}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm text-gray-500 dark:text-gray-400">Last Queried</dt>
                      <dd className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {formatDate(table.last_queried_time)}
                      </dd>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <dt className="text-sm text-gray-500 dark:text-gray-400">Data Billed</dt>
                      <dd className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {formatBytes(table.total_tb_billed * 1024)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm text-gray-500 dark:text-gray-400">Query Cost</dt>
                      <dd className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {formatCost(table.total_query_cost_6m_usd)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm text-gray-500 dark:text-gray-400">Avg Cost/Query</dt>
                      <dd className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {table.total_queries_6m > 0 
                          ? formatCost(table.total_query_cost_6m_usd / table.total_queries_6m)
                          : '$0.00'}
                      </dd>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

const formatBytes = (gb) => {
  if (gb === 0) return '0 GB';
  if (gb < 1) return `${(gb * 1024).toFixed(2)} MB`;
  if (gb >= 1024) return `${(gb / 1024).toFixed(2)} TB`;
  return `${gb.toFixed(2)} GB`;
};

const formatCost = (cost) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(cost);
};

const formatDate = (dateString) => {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
};

const TableAnalysis = ({ project }) => {
  const [tableData, setTableData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [sortField, setSortField] = useState('total_logical_gb');
  const [sortDirection, setSortDirection] = useState('desc');
  const [filterDataset, setFilterDataset] = useState('all');
  const [filterPartitioned, setFilterPartitioned] = useState('all');
  const [filterClustered, setFilterClustered] = useState('all');
  const [filterUsage, setFilterUsage] = useState('all');
  const [datasets, setDatasets] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  useEffect(() => {
    fetchTableAnalysis();
  }, [project.projectId]);

  const fetchTableAnalysis = async () => {
    setIsLoading(true);
    try {
      const response = await projectsApiService.getTableAnalysis(project.projectId);
      if (response && (response.analyses || response.tables)) {
        // Format the response to match what the component expects
        const formattedResponse = {
          success: true,
          tables_analyzed: response.total_tables || response.tables_analyzed || 0,
          analyses: response.analyses || response.tables || [],
          tables: response.analyses || response.tables || [] // For compatibility
        };
        
        setTableData(formattedResponse);
        
        // Extract unique datasets for filter
        const tables = response.analyses || response.tables || [];
        if (tables.length > 0) {
          const uniqueDatasets = [...new Set(tables.map(t => t.dataset_id))];
          setDatasets(uniqueDatasets.sort());
        }
      }
    } catch (error) {
      console.error('Failed to fetch table analysis:', error);
      // Don't show error toast if it's just no data
      if (error.message && !error.message.includes('404')) {
        toast.error('Failed to load table analysis');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const runTableAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const response = await projectsApiService.analyzeProjectTables(project.projectId);
      console.log('Table analysis response:', response); // Debug log
      
      // Check if response indicates success or contains data
      if (response.success === true && response.tables_analyzed > 0) {
        toast.success(`Table analysis completed: ${response.tables_analyzed} tables analyzed`);
        
        // Ensure the response has the correct structure
        const formattedResponse = {
          success: true,
          tables_analyzed: response.tables_analyzed,
          analyses: response.analyses || [],
          tables: response.analyses || [] // Add 'tables' field for compatibility
        };
        
        setTableData(formattedResponse);
        
        // Extract unique datasets for filter
        const uniqueDatasets = [...new Set(response.analyses.map(t => t.dataset_id))];
        setDatasets(uniqueDatasets.sort());
        setCurrentPage(1); // Reset to first page
      } else if (response.success === false) {
        // Handle error response with detailed message
        const errorMessage = response.message || response.error || 'Table analysis failed';
        console.error('Table analysis error:', response);
        
        // Show user-friendly error message
        toast.error(errorMessage, {
          duration: 6000,
          style: {
            maxWidth: '500px',
          }
        });
        
        // If there are additional details, log them
        if (response.details) {
          console.error('Error details:', response.details);
        }
      } else if (response.tables_analyzed === 0) {
        toast.info('No tables found to analyze in this project');
      } else {
        // Handle old format response for backward compatibility
        if (response.tables && response.tables.length > 0) {
          toast.success('Table analysis completed successfully');
          setTableData(response);
          
          const uniqueDatasets = [...new Set(response.tables.map(t => t.dataset_id))];
          setDatasets(uniqueDatasets.sort());
          setCurrentPage(1);
        } else {
          toast.warning('No tables found in the project');
        }
      }
    } catch (error) {
      console.error('Failed to run table analysis:', error);
      toast.error('Failed to connect to the analysis service. Please check your connection and try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const sortTables = (tables) => {
    return [...tables].sort((a, b) => {
      let aValue = a[sortField];
      let bValue = b[sortField];
      
      // Handle null/undefined values
      if (aValue === null || aValue === undefined) aValue = 0;
      if (bValue === null || bValue === undefined) bValue = 0;
      
      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  };

  const filterTables = (tables) => {
    let filtered = tables;
    
    // Dataset filter
    if (filterDataset !== 'all') {
      filtered = filtered.filter(t => t.dataset_id === filterDataset);
    }
    
    // Partitioned filter
    if (filterPartitioned === 'yes') {
      filtered = filtered.filter(t => t.is_partitioned);
    } else if (filterPartitioned === 'no') {
      filtered = filtered.filter(t => !t.is_partitioned);
    }
    
    // Clustered filter
    if (filterClustered === 'yes') {
      filtered = filtered.filter(t => t.is_clustered);
    } else if (filterClustered === 'no') {
      filtered = filtered.filter(t => !t.is_clustered);
    }
    
    // Usage filter
    if (filterUsage === 'active') {
      filtered = filtered.filter(t => t.total_queries_6m > 0);
    } else if (filterUsage === 'unused') {
      filtered = filtered.filter(t => t.total_queries_6m === 0);
    }
    
    return filtered;
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getOptimizationSuggestions = (table) => {
    const suggestions = [];
    
    // Check if table is unused
    if (table.total_queries_6m === 0 && table.table_age_days > 90) {
      suggestions.push({
        type: 'warning',
        text: 'Unused table - consider archiving or deleting',
        severity: 'high'
      });
    }
    
    // Check for partitioning opportunities
    if (!table.is_partitioned && table.total_logical_gb > 1) {
      suggestions.push({
        type: 'info',
        text: 'Consider partitioning for better performance',
        severity: 'medium'
      });
    }
    
    // Check for clustering opportunities
    if (!table.is_clustered && table.total_queries_6m > 100) {
      suggestions.push({
        type: 'info',
        text: 'Consider clustering for query optimization',
        severity: 'medium'
      });
    }
    
    // Check for long-term storage optimization
    if (table.long_term_logical_gb > 0 && table.total_queries_6m === 0) {
      suggestions.push({
        type: 'success',
        text: 'Already optimized with long-term storage',
        severity: 'low'
      });
    }
    
    return suggestions;
  };

  const handleTableClick = (table) => {
    setSelectedTable(table);
    setIsModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Check for both 'tables' and 'analyses' fields for compatibility
  const tables = tableData?.analyses || tableData?.tables || [];
  
  console.log('TableData:', tableData); // Debug log
  console.log('Tables array:', tables); // Debug log
  console.log('Tables length:', tables.length); // Debug log
  
  if (!tableData || !Array.isArray(tables) || tables.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8">
        <div className="text-center">
          <FiDatabase className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            No Table Analysis Available
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Run table analysis to see storage metrics and optimization opportunities
          </p>
          <button
            onClick={runTableAnalysis}
            disabled={isAnalyzing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 mx-auto"
          >
            {isAnalyzing ? (
              <>
                <FiRefreshCw className="h-4 w-4 animate-spin" />
                <span>Analyzing...</span>
              </>
            ) : (
              <>
                <FiActivity className="h-4 w-4" />
                <span>Run Table Analysis</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  const filteredAndSortedTables = sortTables(filterTables(tables));
  
  // Calculate summary statistics from tables data
  const summary = {
    total_tables: tables.length,
    unused_tables_count: tables.filter(t => (t.total_queries_6m || 0) === 0).length,
    total_storage_gb: tables.reduce((sum, t) => sum + (t.total_logical_gb || 0), 0),
    partitioned_tables: tables.filter(t => t.is_partitioned).length,
    clustered_tables: tables.filter(t => t.is_clustered).length,
    total_storage_cost_monthly: tables.reduce((sum, t) => sum + (t.active_storage_cost_monthly_usd || 0) + (t.long_term_storage_cost_monthly_usd || 0), 0),
    total_query_cost_6m: tables.reduce((sum, t) => sum + (t.total_query_cost_6m_usd || 0), 0)
  };
  
  // Pagination
  const totalPages = Math.ceil(filteredAndSortedTables.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedTables = filteredAndSortedTables.slice(startIndex, endIndex);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total Tables</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                {summary.total_tables}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {summary.unused_tables_count} unused
              </p>
            </div>
            <div className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded">
              <FiDatabase className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total Storage</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                {formatBytes(summary.total_storage_gb)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {summary.partitioned_tables} partitioned
              </p>
            </div>
            <div className="p-2 bg-purple-50 dark:bg-purple-950/30 rounded">
              <FiHardDrive className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Storage Cost/Month</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                {formatCost(summary.total_storage_cost_monthly)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {summary.clustered_tables} clustered
              </p>
            </div>
            <div className="p-2 bg-red-50 dark:bg-red-950/30 rounded">
              <FiDollarSign className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Query Cost (6M)</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                {formatCost(summary.total_query_cost_6m)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Last {tableData.analysis_window || 180} days
              </p>
            </div>
            <div className="p-2 bg-green-50 dark:bg-green-950/30 rounded">
              <FiActivity className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center space-x-2">
            <FiFilter className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filters:</span>
          </div>
          
          <select
            value={filterDataset}
            onChange={(e) => {
              setFilterDataset(e.target.value);
              setCurrentPage(1);
            }}
            className="text-sm border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-gray-200"
          >
            <option value="all">All Datasets</option>
            {datasets.map(dataset => (
              <option key={dataset} value={dataset}>{dataset}</option>
            ))}
          </select>

          <select
            value={filterPartitioned}
            onChange={(e) => {
              setFilterPartitioned(e.target.value);
              setCurrentPage(1);
            }}
            className="text-sm border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-gray-200"
          >
            <option value="all">All Tables</option>
            <option value="yes">Partitioned</option>
            <option value="no">Not Partitioned</option>
          </select>

          <select
            value={filterClustered}
            onChange={(e) => {
              setFilterClustered(e.target.value);
              setCurrentPage(1);
            }}
            className="text-sm border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-gray-200"
          >
            <option value="all">All Tables</option>
            <option value="yes">Clustered</option>
            <option value="no">Not Clustered</option>
          </select>

          <select
            value={filterUsage}
            onChange={(e) => {
              setFilterUsage(e.target.value);
              setCurrentPage(1);
            }}
            className="text-sm border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-gray-200"
          >
            <option value="all">All Usage</option>
            <option value="active">Active Tables</option>
            <option value="unused">Unused Tables</option>
          </select>

          <div className="ml-auto flex items-center space-x-2">
            <button
              onClick={runTableAnalysis}
              disabled={isAnalyzing}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {isAnalyzing ? (
                <>
                  <FiRefreshCw className="h-3 w-3 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <FiRefreshCw className="h-3 w-3" />
                  <span>Refresh Analysis</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Tables List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                  onClick={() => handleSort('full_table_name')}
                >
                  Table Name
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  <div className="flex items-center space-x-1">
                    <FiLayers className="h-3 w-3" />
                    <span>Partition</span>
                  </div>
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  <div className="flex items-center space-x-1">
                    <FiGrid className="h-3 w-3" />
                    <span>Cluster</span>
                  </div>
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                  onClick={() => handleSort('total_logical_gb')}
                >
                  Storage
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                  onClick={() => handleSort('total_queries_6m')}
                >
                  Queries (6M)
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                  onClick={() => handleSort('total_query_cost_6m_usd')}
                >
                  Query Cost
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                  onClick={() => handleSort('last_queried_time')}
                >
                  Last Queried
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Optimization
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {paginatedTables.map((table, index) => {
                const suggestions = getOptimizationSuggestions(table);
                return (
                  <tr 
                    key={index} 
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                    onClick={() => handleTableClick(table)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {table.table_name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {table.dataset_id}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {table.is_partitioned ? (
                        <div>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                            Yes
                          </span>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {table.partition_field}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {table.is_clustered ? (
                        <div>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                            Yes
                          </span>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-[100px] truncate" title={table.cluster_fields_raw}>
                            {table.cluster_fields_raw}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-gray-100">
                        {formatBytes(table.total_logical_gb)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {formatCost(table.active_storage_cost_monthly_usd + table.long_term_storage_cost_monthly_usd)}/mo
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-gray-100">
                        {table.total_queries_6m.toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {table.unique_users_6m} users
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-gray-100">
                        {formatCost(table.total_query_cost_6m_usd)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {formatBytes(table.total_tb_billed * 1024)} billed
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-gray-100">
                        {formatDate(table.last_queried_time)}
                      </div>
                      {table.table_age_days && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Created {table.table_age_days}d ago
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        {suggestions.length > 0 ? (
                          suggestions.map((suggestion, idx) => (
                            <div key={idx} className="flex items-start space-x-1">
                              {suggestion.type === 'warning' && <FiAlertTriangle className="h-3 w-3 text-yellow-500 mt-0.5 flex-shrink-0" />}
                              {suggestion.type === 'info' && <FiInfo className="h-3 w-3 text-blue-500 mt-0.5 flex-shrink-0" />}
                              {suggestion.type === 'success' && <FiCheckCircle className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />}
                              <span className="text-xs text-gray-600 dark:text-gray-400">{suggestion.text}</span>
                            </div>
                          ))
                        ) : (
                          <div className="flex items-center space-x-1">
                            <FiCheckCircle className="h-3 w-3 text-green-500" />
                            <span className="text-xs text-gray-600 dark:text-gray-400">Optimized</span>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-700 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                  <span className="font-medium">{Math.min(endIndex, filteredAndSortedTables.length)}</span> of{' '}
                  <span className="font-medium">{filteredAndSortedTables.length}</span> results
                </p>
              </div>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <label className="text-sm text-gray-700 dark:text-gray-300">Items per page:</label>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="text-sm border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-gray-200"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="sr-only">Previous</span>
                    <FiChevronLeft className="h-5 w-5" />
                  </button>
                  
                  {/* Page numbers */}
                  {[...Array(Math.min(5, totalPages))].map((_, idx) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = idx + 1;
                    } else if (currentPage <= 3) {
                      pageNum = idx + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + idx;
                    } else {
                      pageNum = currentPage - 2 + idx;
                    }
                    
                    return (
                      <button
                        key={idx}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                          currentPage === pageNum
                            ? 'z-10 bg-blue-50 dark:bg-blue-900 border-blue-500 text-blue-600 dark:text-blue-400'
                            : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="sr-only">Next</span>
                    <FiChevronRight className="h-5 w-5" />
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Table Details Modal */}
      <TableDetailsModal
        table={selectedTable}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};

export default TableAnalysis;