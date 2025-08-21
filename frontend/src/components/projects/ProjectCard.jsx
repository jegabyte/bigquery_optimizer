import React from 'react';
import { motion } from 'framer-motion';
import { 
  FiBarChart2, 
  FiDollarSign, 
  FiClock, 
  FiActivity,
  FiTrendingUp,
  FiSettings,
  FiTrash2,
  FiRefreshCw,
  FiPause
} from 'react-icons/fi';
import { formatCost } from '../../services/projectsMockData';

const ProjectCard = ({ project, onRefresh, onEdit, onRemove, onPause }) => {
  const getComplianceColor = (score) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getComplianceBg = (score) => {
    if (score >= 80) return 'bg-green-50 dark:bg-green-950/30';
    if (score >= 60) return 'bg-yellow-50 dark:bg-yellow-950/30';
    return 'bg-red-50 dark:bg-red-950/30';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md transition-shadow"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {project.name}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {project.projectId}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => onRefresh(project.projectId || project.project_id)}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            title="Refresh"
          >
            <FiRefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => onEdit(project.projectId || project.project_id)}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            title="Edit Settings"
          >
            <FiSettings className="h-4 w-4" />
          </button>
          <button
            onClick={() => onPause(project.projectId || project.project_id)}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            title="Pause Collection"
          >
            <FiPause className="h-4 w-4" />
          </button>
          <button
            onClick={() => onRemove(project.projectId || project.project_id)}
            className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
            title="Remove"
          >
            <FiTrash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Last Updated */}
      <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 mb-4">
        <FiClock className="h-3 w-3 mr-1" />
        Last updated: {project.lastUpdated instanceof Date ? project.lastUpdated.toLocaleString() : new Date(project.lastUpdated).toLocaleString()}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="flex items-start space-x-3">
          <div className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded">
            <FiActivity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {project.stats.templatesDiscovered}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Query Templates</p>
          </div>
        </div>

        <div className="flex items-start space-x-3">
          <div className="p-2 bg-purple-50 dark:bg-purple-950/30 rounded">
            <FiBarChart2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {project.stats.totalRuns.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Runs ({project.analysisWindow}d)
            </p>
          </div>
        </div>

        <div className="flex items-start space-x-3">
          <div className="p-2 bg-red-50 dark:bg-red-950/30 rounded">
            <FiDollarSign className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {formatCost(project.stats.estimatedMonthlySpend)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Monthly Spend</p>
          </div>
        </div>

        <div className="flex items-start space-x-3">
          <div className={`p-2 rounded ${getComplianceBg(project.stats.complianceScore)}`}>
            <FiTrendingUp className={`h-5 w-5 ${getComplianceColor(project.stats.complianceScore)}`} />
          </div>
          <div>
            <p className={`text-sm font-medium ${getComplianceColor(project.stats.complianceScore)}`}>
              {project.stats.complianceScore}%
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Compliance</p>
          </div>
        </div>
      </div>

      {/* Potential Savings Banner */}
      {project.stats.potentialSavings > 0 && (
        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-green-700 dark:text-green-300">
              Potential monthly savings
            </span>
            <span className="text-sm font-semibold text-green-700 dark:text-green-300">
              {formatCost(project.stats.potentialSavings)}
            </span>
          </div>
        </div>
      )}

      {/* Settings Summary */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center space-x-4">
          <span>
            {project.regions.join(', ')}
          </span>
          <span>•</span>
          <span>
            {project.datasets.length} datasets
          </span>
        </div>
        <span className="font-medium">
          {project.pricingMode === 'on-demand' ? 'On-demand' : 'Flat-rate'}
        </span>
      </div>
    </motion.div>
  );
};

export default ProjectCard;