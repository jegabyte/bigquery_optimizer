import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  FiArrowLeft,
  FiRefreshCw,
  FiSettings,
  FiTrash2,
  FiPause,
  FiDollarSign,
  FiActivity,
  FiBarChart2,
  FiTrendingUp,
  FiClock,
  FiMapPin,
  FiDatabase,
  FiTag,
  FiAlertTriangle
} from 'react-icons/fi';
import TemplatesGrid from './TemplatesGrid';
import TemplateDetails from './TemplateDetails';
import { getProjectTemplates, formatCost } from '../../services/projectsMockData';

const ProjectDetailView = ({ project, onBack, onRefresh, onEdit, onRemove, onPause }) => {
  const [templates] = useState(getProjectTemplates(project.id));
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isTemplateDrawerOpen, setIsTemplateDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('templates');

  const handleTemplateClick = (template) => {
    setSelectedTemplate(template);
    setIsTemplateDrawerOpen(true);
  };

  const handleBulkAction = (action, templateIds) => {
    console.log('Bulk action:', action, templateIds);
    alert(`${action} ${templateIds.length} template(s)`);
  };

  const handleAnalyzeTemplate = (templateId, options) => {
    console.log('Analyze template:', templateId, options);
    alert(`Starting analysis with mode: ${options.mode}`);
    setIsTemplateDrawerOpen(false);
  };

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

  const tabs = [
    { id: 'templates', label: 'Query Templates', count: templates.length },
    { id: 'overview', label: 'Overview' },
    { id: 'settings', label: 'Settings' },
    { id: 'activity', label: 'Activity' }
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Warning Banner */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center">
            <FiAlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
            <p className="ml-3 text-sm font-medium text-yellow-800 dark:text-yellow-300">
              This is a mock page with sample data. The actual implementation is yet to be completed.
            </p>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <FiArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {project.name}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {project.projectId}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => onRefresh(project.id)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 flex items-center space-x-2"
              >
                <FiRefreshCw className="h-4 w-4" />
                <span>Refresh</span>
              </button>
              <button
                onClick={() => onEdit(project.id)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 flex items-center space-x-2"
              >
                <FiSettings className="h-4 w-4" />
                <span>Settings</span>
              </button>
              <button
                onClick={() => onPause(project.id)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 flex items-center space-x-2"
              >
                <FiPause className="h-4 w-4" />
                <span>Pause</span>
              </button>
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to remove this project?')) {
                    onRemove(project.id);
                    onBack();
                  }
                }}
                className="px-4 py-2 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 flex items-center space-x-2"
              >
                <FiTrash2 className="h-4 w-4" />
                <span>Remove</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Query Templates</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                  {project.stats.templatesDiscovered}
                </p>
              </div>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded">
                <FiActivity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
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
                <p className="text-xs text-gray-500 dark:text-gray-400">Total Runs</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                  {project.stats.totalRuns.toLocaleString()}
                </p>
              </div>
              <div className="p-2 bg-purple-50 dark:bg-purple-950/30 rounded">
                <FiBarChart2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
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
                <p className="text-xs text-gray-500 dark:text-gray-400">Monthly Spend</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                  {formatCost(project.stats.estimatedMonthlySpend)}
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
                <p className="text-xs text-gray-500 dark:text-gray-400">Potential Savings</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                  {formatCost(project.stats.potentialSavings)}
                </p>
              </div>
              <div className="p-2 bg-green-50 dark:bg-green-950/30 rounded">
                <FiDollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Compliance</p>
                <p className={`text-2xl font-bold ${getComplianceColor(project.stats.complianceScore)} mt-1`}>
                  {project.stats.complianceScore}%
                </p>
              </div>
              <div className={`p-2 rounded ${getComplianceBg(project.stats.complianceScore)}`}>
                <FiTrendingUp className={`h-5 w-5 ${getComplianceColor(project.stats.complianceScore)}`} />
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                {tab.label}
                {tab.count && (
                  <span className="ml-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 py-0.5 px-2 rounded-full text-xs">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'templates' && (
          <TemplatesGrid
            templates={templates}
            onTemplateClick={handleTemplateClick}
            onBulkAction={handleBulkAction}
          />
        )}

        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Project Info */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Project Information
              </h3>
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500 dark:text-gray-400">
                    <FiClock className="inline h-4 w-4 mr-2" />
                    Last Updated
                  </dt>
                  <dd className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {project.lastUpdated.toLocaleString()}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500 dark:text-gray-400">
                    <FiMapPin className="inline h-4 w-4 mr-2" />
                    Regions
                  </dt>
                  <dd className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {project.regions.join(', ')}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500 dark:text-gray-400">
                    <FiDatabase className="inline h-4 w-4 mr-2" />
                    Datasets
                  </dt>
                  <dd className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {project.datasets.length} datasets
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500 dark:text-gray-400">
                    <FiTag className="inline h-4 w-4 mr-2" />
                    Pricing Mode
                  </dt>
                  <dd className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {project.pricingMode === 'on-demand' ? 'On-demand' : 'Flat-rate'} @ ${project.pricePerTB}/TB
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500 dark:text-gray-400">
                    Analysis Window
                  </dt>
                  <dd className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {project.analysisWindow} days
                  </dd>
                </div>
              </dl>
            </div>

            {/* Top Cost Drivers */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Top Cost Drivers
              </h3>
              <div className="space-y-3">
                {project.topCostDrivers.map((driver, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      <span className="text-sm text-gray-400 dark:text-gray-500 w-4">{index + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {driver.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {driver.runs} runs • {driver.bytesProcessed}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100 ml-4">
                      {formatCost(driver.cost)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Project Settings
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Settings configuration will be available here.
            </p>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Recent Activity
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Activity logs will be displayed here.
            </p>
          </div>
        )}
      </div>

      {/* Template Details Drawer */}
      <TemplateDetails
        template={selectedTemplate}
        isOpen={isTemplateDrawerOpen}
        onClose={() => setIsTemplateDrawerOpen(false)}
        onAnalyze={handleAnalyzeTemplate}
      />
    </div>
  );
};

export default ProjectDetailView;