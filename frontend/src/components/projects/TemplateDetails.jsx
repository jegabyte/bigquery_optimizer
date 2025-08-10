import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiX,
  FiPlay,
  FiCopy,
  FiDownload,
  FiCheckCircle,
  FiAlertTriangle,
  FiInfo,
  FiClock,
  FiBarChart2,
  FiServer,
  FiRefreshCw,
  FiDollarSign,
  FiTrendingUp
} from 'react-icons/fi';
import { formatBytes, formatCost, formatRuntime, getTemplateRuns } from '../../services/projectsMockData';
import MonacoEditor from '@monaco-editor/react';

const TemplateDetails = ({ template, isOpen, onClose, onAnalyze }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [runs, setRuns] = useState([]);
  const [analysisOptions, setAnalysisOptions] = useState({
    mode: 'rules_rewrite_validate',
    parameters: {}
  });

  useEffect(() => {
    if (template && isOpen) {
      // Use recent runs from the template data
      setRuns(template.recentRuns || []);
      setActiveTab('overview');
    }
  }, [template, isOpen]);

  if (!template) return null;

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'high':
        return <FiAlertTriangle className="h-5 w-5 text-red-500" />;
      case 'medium':
        return <FiAlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'low':
        return <FiInfo className="h-5 w-5 text-blue-500" />;
      default:
        return <FiInfo className="h-5 w-5 text-gray-500" />;
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'runs', label: `Runs (${template.runs || 0})` },
    { id: 'analyze', label: 'Analyze' },
    { id: 'results', label: 'Results', disabled: !template.lastAnalysis }
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-[800px] bg-white dark:bg-gray-800 shadow-xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  Template Details
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {template.runs} runs • {template.runsPerDay} runs/day
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <FiX className="h-6 w-6" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex space-x-6 px-6 border-b border-gray-200 dark:border-gray-700">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  disabled={tab.disabled}
                  className={`py-3 px-1 border-b-2 transition-colors text-sm font-medium ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : tab.disabled
                      ? 'border-transparent text-gray-300 dark:text-gray-600 cursor-not-allowed'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* SQL Preview */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      Full SQL Query
                    </h3>
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      <MonacoEditor
                        height="200px"
                        language="sql"
                        theme={document.documentElement.classList.contains('dark') ? 'vs-dark' : 'light'}
                        value={template.fullSql}
                        options={{
                          readOnly: true,
                          minimap: { enabled: false },
                          scrollBeyondLastLine: false,
                          fontSize: 12
                        }}
                      />
                    </div>
                    <div className="flex items-center space-x-2 mt-2">
                      <button
                        onClick={() => navigator.clipboard.writeText(template.fullSql)}
                        className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 flex items-center space-x-2"
                      >
                        <FiCopy className="h-4 w-4" />
                        <span>Copy SQL</span>
                      </button>
                    </div>
                  </div>

                  {/* Metrics */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      Performance Metrics
                    </h3>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                        <div className="flex items-center space-x-2 mb-2">
                          <FiServer className="h-4 w-4 text-gray-500" />
                          <span className="text-xs text-gray-500 dark:text-gray-400">Data Processed</span>
                        </div>
                        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {formatBytes(template.avgBytesProcessed || 0)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Avg per run • P90: {formatBytes(template.bytesProcessedP90 || 0)}
                        </p>
                      </div>

                      <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                        <div className="flex items-center space-x-2 mb-2">
                          <FiClock className="h-4 w-4 text-gray-500" />
                          <span className="text-xs text-gray-500 dark:text-gray-400">Runtime</span>
                        </div>
                        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {formatRuntime(template.avgRuntime || 0)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Avg • P50: {formatRuntime(template.runtimeP50 || 0)}
                        </p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                        <div className="flex items-center space-x-2 mb-2">
                          <FiBarChart2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          <span className="text-xs text-blue-600 dark:text-blue-400">Frequency</span>
                        </div>
                        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {template.runs}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          Total runs • {(template.runsPerDay || 0).toFixed(1)}/day
                        </p>
                      </div>

                      <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                        <div className="flex items-center space-x-2 mb-2">
                          <FiDollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
                          <span className="text-xs text-green-600 dark:text-green-400">Cost per Run</span>
                        </div>
                        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          ${(template.avgCostPerRun || 0).toFixed(3)}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          Total: ${(template.totalCost || 0).toFixed(2)}
                        </p>
                      </div>

                      <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
                        <div className="flex items-center space-x-2 mb-2">
                          <FiTrendingUp className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                          <span className="text-xs text-orange-600 dark:text-orange-400">Monthly Cost</span>
                        </div>
                        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          ${(template.estimatedMonthlyCost || 0).toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          Estimated
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Tables */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      Referenced Tables
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {template.tables.map((table, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                        >
                          {table}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* State & Analysis */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      Analysis Status
                    </h3>
                    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                            template.state === 'new' ? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' :
                            template.state === 'analyzed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' :
                            template.state === 'validated' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300' :
                            template.state === 'applied' ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' :
                            'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300'
                          }`}>
                            {template.state}
                          </span>
                          {template.complianceScore && (
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              Compliance: {template.complianceScore}%
                            </span>
                          )}
                        </div>
                        {template.lastAnalysis && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            Last analyzed: {template.lastAnalysis.toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      {template.state === 'new' ? (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          This template has not been analyzed yet. Run an analysis to identify optimization opportunities.
                        </p>
                      ) : (
                        <button
                          onClick={() => setActiveTab('results')}
                          className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          View analysis results →
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Runs Tab */}
              {activeTab === 'runs' && (
                <div>
                  <div className="mb-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Individual query executions for this template over the analysis window.
                    </p>
                  </div>
                  {runs.length === 0 && template.runs > 0 ? (
                    <div className="text-center py-8 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                      <p className="text-gray-600 dark:text-gray-400">
                        This template has been executed <span className="font-semibold">{template.runs}</span> times
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                        Detailed run history will be available after full analysis
                      </p>
                    </div>
                  ) : runs.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                      <p className="text-gray-600 dark:text-gray-400">
                        No runs recorded for this template
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                    {runs.map((run, idx) => (
                      <div
                        key={run.job_id || idx}
                        className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {run.start_time ? new Date(run.start_time).toLocaleString() : 'N/A'}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              Job ID: {run.job_id}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              User: {run.user_email}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                              ${(run.estimated_cost || 0).toFixed(4)}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {formatBytes(run.bytes_processed || 0)}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {formatRuntime(run.runtime_seconds || 0)}
                            </p>
                          </div>
                        </div>
                        {run.slot_ms && (
                          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                              <span>Slot time: {(run.slot_ms / 1000).toFixed(1)}s</span>
                              <span>Billed: {formatBytes(run.bytes_billed || run.bytes_processed || 0)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    </div>
                  )}
                </div>
              )}

              {/* Analyze Tab */}
              {activeTab === 'analyze' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      Analysis Options
                    </h3>
                    <div className="space-y-3">
                      <label className="flex items-start space-x-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                        <input
                          type="radio"
                          name="analysisMode"
                          value="rules_only"
                          checked={analysisOptions.mode === 'rules_only'}
                          onChange={(e) => setAnalysisOptions({ ...analysisOptions, mode: e.target.value })}
                          className="mt-1"
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            Rules Only
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Identify anti-patterns and compliance issues
                          </p>
                        </div>
                      </label>

                      <label className="flex items-start space-x-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                        <input
                          type="radio"
                          name="analysisMode"
                          value="rules_rewrite"
                          checked={analysisOptions.mode === 'rules_rewrite'}
                          onChange={(e) => setAnalysisOptions({ ...analysisOptions, mode: e.target.value })}
                          className="mt-1"
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            Rules + Rewrite
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Generate optimized SQL based on identified issues
                          </p>
                        </div>
                      </label>

                      <label className="flex items-start space-x-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                        <input
                          type="radio"
                          name="analysisMode"
                          value="rules_rewrite_validate"
                          checked={analysisOptions.mode === 'rules_rewrite_validate'}
                          onChange={(e) => setAnalysisOptions({ ...analysisOptions, mode: e.target.value })}
                          className="mt-1"
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            Rules + Rewrite + Validate
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Full analysis with impact estimation
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      Parameters (Optional)
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                          Date Range Preset
                        </label>
                        <select className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
                          <option>Last 7 days</option>
                          <option>Last 30 days</option>
                          <option>Month to date</option>
                          <option>Custom range</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => onAnalyze(template.id, analysisOptions)}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
                  >
                    <FiPlay className="h-5 w-5" />
                    <span>Run Analysis</span>
                  </button>
                </div>
              )}

              {/* Results Tab */}
              {activeTab === 'results' && template.lastAnalysis && (
                <div className="space-y-6">
                  {/* Compliance Score */}
                  {template.complianceScore && (
                    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        Compliance Score
                      </h3>
                      <div className="flex items-center space-x-4">
                        <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                          {template.complianceScore}%
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {template.issues.length} issues found
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Issues */}
                  {template.issues && template.issues.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        Identified Issues
                      </h3>
                      <div className="space-y-2">
                        {template.issues.map((issue, idx) => (
                          <div
                            key={idx}
                            className="flex items-start space-x-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
                          >
                            {getSeverityIcon(issue.severity)}
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {issue.rule}
                              </p>
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                {issue.description}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                Impact: {issue.impact}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Optimized SQL */}
                  {template.optimizedSql && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        Optimized SQL
                      </h3>
                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                        <MonacoEditor
                          height="300px"
                          language="sql"
                          theme={document.documentElement.classList.contains('dark') ? 'vs-dark' : 'light'}
                          value={template.optimizedSql}
                          options={{
                            readOnly: true,
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            fontSize: 12
                          }}
                        />
                      </div>
                      <div className="flex items-center space-x-2 mt-2">
                        <button
                          onClick={() => navigator.clipboard.writeText(template.optimizedSql)}
                          className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 flex items-center space-x-2"
                        >
                          <FiCopy className="h-4 w-4" />
                          <span>Copy Optimized SQL</span>
                        </button>
                        <button className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 flex items-center space-x-2">
                          <FiDownload className="h-4 w-4" />
                          <span>Download</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Impact Estimate */}
                  {template.estimatedSavings && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        Estimated Impact
                      </h3>
                      <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-xs text-green-600 dark:text-green-400">Before</p>
                            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                              {formatCost(template.estimatedSavings.before)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-green-600 dark:text-green-400">After</p>
                            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                              {formatCost(template.estimatedSavings.after)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-green-600 dark:text-green-400">Reduction</p>
                            <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                              {template.estimatedSavings.reduction}%
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center space-x-3">
                    <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2">
                      <FiCheckCircle className="h-5 w-5" />
                      <span>Mark as Applied</span>
                    </button>
                    <button className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center space-x-2">
                      <FiRefreshCw className="h-5 w-5" />
                      <span>Re-analyze</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default TemplateDetails;