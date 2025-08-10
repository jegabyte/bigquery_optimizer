import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiChevronUp,
  FiChevronDown,
  FiFilter,
  FiSearch,
  FiCheck,
  FiPlay,
  FiX,
  FiRefreshCw,
  FiEyeOff,
  FiCopy
} from 'react-icons/fi';
import { formatBytes, formatCost, formatRuntime } from '../../services/projectsMockData';

const TemplatesGrid = ({ templates, onTemplateClick, onBulkAction }) => {
  const [selectedTemplates, setSelectedTemplates] = useState(new Set());
  const [sortBy, setSortBy] = useState('bytesProcessedP90');
  const [sortOrder, setSortOrder] = useState('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [minRuns, setMinRuns] = useState('');
  const [minBytes, setMinBytes] = useState('');

  // Filter and sort templates
  const filteredTemplates = useMemo(() => {
    let filtered = [...templates];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t => 
        t.sqlSnippet.toLowerCase().includes(query) ||
        t.tables.some(table => table.toLowerCase().includes(query))
      );
    }

    // State filter
    if (stateFilter !== 'all') {
      filtered = filtered.filter(t => t.state === stateFilter);
    }

    // Min runs filter
    if (minRuns) {
      filtered = filtered.filter(t => t.runs >= parseInt(minRuns));
    }

    // Min bytes filter
    if (minBytes) {
      const minBytesValue = parseFloat(minBytes) * 1e9; // Convert GB to bytes
      filtered = filtered.filter(t => t.bytesProcessedP90 >= minBytesValue);
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];
      
      if (sortBy === 'lastSeen' || sortBy === 'firstSeen') {
        aVal = aVal?.getTime() || 0;
        bVal = bVal?.getTime() || 0;
      }
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    return filtered;
  }, [templates, searchQuery, stateFilter, minRuns, minBytes, sortBy, sortOrder]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const handleSelectAll = () => {
    if (selectedTemplates.size === filteredTemplates.length) {
      setSelectedTemplates(new Set());
    } else {
      setSelectedTemplates(new Set(filteredTemplates.map(t => t.id)));
    }
  };

  const handleSelectTemplate = (templateId) => {
    const newSelected = new Set(selectedTemplates);
    if (newSelected.has(templateId)) {
      newSelected.delete(templateId);
    } else {
      newSelected.add(templateId);
    }
    setSelectedTemplates(newSelected);
  };

  const getStateColor = (state) => {
    const colors = {
      'new': 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
      'analyzed': 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
      'validated': 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
      'applied': 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
      'snoozed': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300'
    };
    return colors[state] || colors['new'];
  };

  const SortIcon = ({ field }) => {
    if (sortBy !== field) return null;
    return sortOrder === 'asc' ? 
      <FiChevronUp className="h-3 w-3" /> : 
      <FiChevronDown className="h-3 w-3" />;
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      {/* Header with Search and Filters */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Query Templates ({filteredTemplates.length})
          </h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-1.5 rounded-lg border transition-colors flex items-center space-x-2 text-sm ${
                showFilters 
                  ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-600 dark:text-blue-300'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              <FiFilter className="h-4 w-4" />
              <span>Filters</span>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by SQL, table, or dataset..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Filters Panel */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    State
                  </label>
                  <select
                    value={stateFilter}
                    onChange={(e) => setStateFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All States</option>
                    <option value="new">New</option>
                    <option value="analyzed">Analyzed</option>
                    <option value="validated">Validated</option>
                    <option value="applied">Applied</option>
                    <option value="snoozed">Snoozed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Min Runs
                  </label>
                  <input
                    type="number"
                    placeholder="e.g., 10"
                    value={minRuns}
                    onChange={(e) => setMinRuns(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Min P90 Bytes (GB)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g., 100"
                    value={minBytes}
                    onChange={(e) => setMinBytes(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setStateFilter('all');
                      setMinRuns('');
                      setMinBytes('');
                      setSearchQuery('');
                    }}
                    className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bulk Actions Bar */}
      <AnimatePresence>
        {selectedTemplates.size > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 px-4 py-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-blue-700 dark:text-blue-300">
                {selectedTemplates.size} template{selectedTemplates.size > 1 ? 's' : ''} selected
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => onBulkAction('analyze', Array.from(selectedTemplates))}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2 text-sm"
                >
                  <FiPlay className="h-4 w-4" />
                  <span>Run Analysis</span>
                </button>
                <button
                  onClick={() => onBulkAction('reanalyze', Array.from(selectedTemplates))}
                  className="px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors flex items-center space-x-2 text-sm"
                >
                  <FiRefreshCw className="h-4 w-4" />
                  <span>Re-analyze</span>
                </button>
                <button
                  onClick={() => onBulkAction('snooze', Array.from(selectedTemplates))}
                  className="px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors flex items-center space-x-2 text-sm"
                >
                  <FiEyeOff className="h-4 w-4" />
                  <span>Snooze</span>
                </button>
                <button
                  onClick={() => setSelectedTemplates(new Set())}
                  className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  <FiX className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selectedTemplates.size === filteredTemplates.length && filteredTemplates.length > 0}
                  onChange={handleSelectAll}
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 max-w-xs"
                onClick={() => handleSort('sqlSnippet')}
              >
                <div className="flex items-center space-x-1">
                  <span>Query Pattern</span>
                  <SortIcon field="sqlSnippet" />
                </div>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Tables Used
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-200"
                onClick={() => handleSort('runs')}
              >
                <div className="flex items-center space-x-1">
                  <span>Runs</span>
                  <SortIcon field="runs" />
                </div>
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-200"
                onClick={() => handleSort('bytesProcessedP90')}
              >
                <div className="flex items-center space-x-1">
                  <span>P90 Bytes</span>
                  <SortIcon field="bytesProcessedP90" />
                </div>
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-200"
                onClick={() => handleSort('runtimeP50')}
              >
                <div className="flex items-center space-x-1">
                  <span>P50 Runtime</span>
                  <SortIcon field="runtimeP50" />
                </div>
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-200"
                onClick={() => handleSort('lastSeen')}
              >
                <div className="flex items-center space-x-1">
                  <span>Last Seen</span>
                  <SortIcon field="lastSeen" />
                </div>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                State
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredTemplates.map((template) => (
              <motion.tr
                key={template.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                onClick={() => onTemplateClick(template)}
              >
                <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedTemplates.has(template.id)}
                    onChange={() => handleSelectTemplate(template.id)}
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                </td>
                <td className="px-4 py-4 max-w-sm">
                  <div className="group relative">
                    <div>
                      <p className="text-sm text-gray-900 dark:text-gray-100 font-mono text-xs leading-tight">
                        {template.sqlSnippet.split(' ').slice(0, 8).join(' ')}...
                      </p>
                      <div className="flex items-center mt-1 space-x-2">
                        {template.runs > 100 && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">
                            High freq
                          </span>
                        )}
                        {template.state === 'new' && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                            Unanalyzed
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Tooltip on hover */}
                    <div className="absolute z-10 invisible group-hover:visible bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 w-[500px] -top-2 left-0 transform -translate-y-full">
                      <p className="text-xs text-gray-400 mb-2">Full Query Pattern:</p>
                      <pre className="whitespace-pre-wrap font-mono text-xs text-gray-100">{template.fullSql || template.sqlSnippet}</pre>
                      <div className="absolute bottom-0 left-6 transform translate-y-1/2 rotate-45 w-2 h-2 bg-gray-900 dark:bg-gray-800"></div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-1">
                    {template.tables.slice(0, 2).map((table, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                      >
                        {table}
                      </span>
                    ))}
                    {template.tables.length > 2 && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        +{template.tables.length - 2}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {template.runs.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {template.runsPerDay}/day
                    </p>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {formatBytes(template.bytesProcessedP90)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      P99: {formatBytes(template.bytesProcessedP99)}
                    </p>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {formatRuntime(template.runtimeP50)}
                  </p>
                </td>
                <td className="px-4 py-4">
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {template.lastSeen.toLocaleDateString()}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {template.lastSeen.toLocaleTimeString()}
                  </p>
                </td>
                <td className="px-4 py-4">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStateColor(template.state)}`}>
                    {template.state}
                  </span>
                </td>
                <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center space-x-2">
                    {template.state === 'new' && (
                      <button
                        onClick={() => onBulkAction('analyze', [template.id])}
                        className="p-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        title="Analyze"
                      >
                        <FiPlay className="h-4 w-4" />
                      </button>
                    )}
                    {template.state === 'analyzed' && (
                      <button
                        onClick={() => onBulkAction('validate', [template.id])}
                        className="p-1 text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300"
                        title="Validate"
                      >
                        <FiCheck className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => navigator.clipboard.writeText(template.fullSql)}
                      className="p-1 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
                      title="Copy SQL"
                    >
                      <FiCopy className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Empty State */}
      {filteredTemplates.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">
            No templates found matching your criteria
          </p>
        </div>
      )}
    </div>
  );
};

export default TemplatesGrid;