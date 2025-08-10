import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiX,
  FiChevronRight,
  FiChevronLeft,
  FiCheck,
  FiAlertTriangle,
  FiCloud,
  FiSettings,
  FiBarChart2,
  FiZap
} from 'react-icons/fi';

const ProjectOnboarding = ({ isOpen, onClose, onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [projectData, setProjectData] = useState({
    projectId: '',
    name: '',
    analysisWindow: 30,
    regions: [],
    datasets: [],
    pricingMode: 'on-demand',
    pricePerTB: 5.00,
    autoDetectRegions: true,
    autoDetectDatasets: true,
    scopeAllDatasets: true
  });
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  const steps = [
    { id: 'project', title: 'Project Details', icon: FiCloud },
    { id: 'settings', title: 'Analysis Settings', icon: FiSettings },
    { id: 'validation', title: 'Validation', icon: FiBarChart2 },
    { id: 'review', title: 'Review & Create', icon: FiZap }
  ];

  const handleNext = () => {
    if (currentStep === 2) {
      // Perform validation
      performValidation();
    } else if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const performValidation = async () => {
    setIsValidating(true);
    // Simulate validation
    setTimeout(() => {
      setValidationResult({
        success: true,
        regions: ['us-central1', 'us-east1'],
        datasets: ['ecommerce', 'marketing', 'analytics'],
        recentJobs: 1543,
        estimatedTemplates: 156,
        warnings: projectData.scopeAllDatasets ? [] : ['Some datasets may be excluded from analysis']
      });
      setProjectData({
        ...projectData,
        regions: ['us-central1', 'us-east1'],
        datasets: projectData.scopeAllDatasets ? [] : ['ecommerce', 'marketing', 'analytics']
      });
      setIsValidating(false);
      setCurrentStep(3);
    }, 2000);
  };

  const handleComplete = () => {
    onComplete(projectData);
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                GCP Project ID *
              </label>
              <input
                type="text"
                value={projectData.projectId}
                onChange={(e) => setProjectData({ ...projectData, projectId: e.target.value })}
                placeholder="e.g., my-project-123456"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                The GCP project containing your BigQuery datasets
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Display Name
              </label>
              <input
                type="text"
                value={projectData.name}
                onChange={(e) => setProjectData({ ...projectData, name: e.target.value })}
                placeholder="e.g., Production Analytics"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                A friendly name for this project (optional)
              </p>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <FiAlertTriangle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300">
                    Required Permissions
                  </h3>
                  <p className="mt-1 text-sm text-blue-700 dark:text-blue-400">
                    Ensure your service account has BigQuery Data Viewer and Job User roles.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Analysis Window
              </label>
              <select
                value={projectData.analysisWindow}
                onChange={(e) => setProjectData({ ...projectData, analysisWindow: parseInt(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days (Recommended)</option>
                <option value={90}>Last 90 days</option>
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Time period to analyze for query patterns
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Data Regions
              </label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={projectData.autoDetectRegions}
                    onChange={(e) => setProjectData({ ...projectData, autoDetectRegions: e.target.checked })}
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    Auto-detect regions from query history
                  </span>
                </label>
                {!projectData.autoDetectRegions && (
                  <input
                    type="text"
                    placeholder="e.g., us-central1, us-east1"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Dataset Scope
              </label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="datasetScope"
                    checked={projectData.scopeAllDatasets}
                    onChange={() => setProjectData({ ...projectData, scopeAllDatasets: true })}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    All datasets (Recommended)
                  </span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="datasetScope"
                    checked={!projectData.scopeAllDatasets}
                    onChange={() => setProjectData({ ...projectData, scopeAllDatasets: false })}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    Specific datasets only
                  </span>
                </label>
                {!projectData.scopeAllDatasets && (
                  <input
                    type="text"
                    placeholder="e.g., analytics, marketing, sales"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 ml-6"
                  />
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Pricing Configuration
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                    Pricing Mode
                  </label>
                  <select
                    value={projectData.pricingMode}
                    onChange={(e) => setProjectData({ ...projectData, pricingMode: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="on-demand">On-demand</option>
                    <option value="flat-rate">Flat-rate</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                    Price per TB ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={projectData.pricePerTB}
                    onChange={(e) => setProjectData({ ...projectData, pricePerTB: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Used for cost estimation and savings calculations
              </p>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            {isValidating ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-950/30 rounded-full mb-4">
                  <svg className="animate-spin h-8 w-8 text-blue-600 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                  Validating Project Configuration
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Checking permissions and discovering metadata...
                </p>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-600 dark:text-gray-400">
                  Click "Validate" to verify your configuration
                </p>
              </div>
            )}
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            {validationResult && validationResult.success && (
              <>
                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <div className="flex">
                    <FiCheck className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-green-800 dark:text-green-300">
                        Validation Successful
                      </h3>
                      <p className="mt-1 text-sm text-green-700 dark:text-green-400">
                        Project configuration validated successfully
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Discovery Results
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Regions Detected</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {validationResult.regions.join(', ')}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Datasets Found</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {projectData.scopeAllDatasets ? 'All datasets' : validationResult.datasets.length}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Recent Jobs</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {validationResult.recentJobs.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Estimated Templates</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        ~{validationResult.estimatedTemplates}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Configuration Summary
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                    <dl className="space-y-2">
                      <div className="flex justify-between">
                        <dt className="text-sm text-gray-600 dark:text-gray-400">Project ID:</dt>
                        <dd className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {projectData.projectId || 'analytics-prod-394821'}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-sm text-gray-600 dark:text-gray-400">Display Name:</dt>
                        <dd className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {projectData.name || 'Analytics Production'}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-sm text-gray-600 dark:text-gray-400">Analysis Window:</dt>
                        <dd className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {projectData.analysisWindow} days
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-sm text-gray-600 dark:text-gray-400">Pricing:</dt>
                        <dd className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {projectData.pricingMode} @ ${projectData.pricePerTB}/TB
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>

                {validationResult.warnings && validationResult.warnings.length > 0 && (
                  <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                    <div className="flex">
                      <FiAlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                          Warnings
                        </h3>
                        <ul className="mt-1 text-sm text-yellow-700 dark:text-yellow-400 list-disc list-inside">
                          {validationResult.warnings.map((warning, idx) => (
                            <li key={idx}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    Add New Project
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Connect your GCP project to discover and optimize query templates
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <FiX className="h-6 w-6" />
                </button>
              </div>

              {/* Progress Steps */}
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  {steps.map((step, index) => {
                    const Icon = step.icon;
                    return (
                      <div key={step.id} className="flex items-center">
                        <div className={`flex items-center ${index < steps.length - 1 ? 'flex-1' : ''}`}>
                          <div
                            className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors ${
                              index <= currentStep
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-400'
                            }`}
                          >
                            {index < currentStep ? (
                              <FiCheck className="h-5 w-5" />
                            ) : (
                              <Icon className="h-5 w-5" />
                            )}
                          </div>
                          <span
                            className={`ml-3 text-sm font-medium ${
                              index <= currentStep
                                ? 'text-gray-900 dark:text-gray-100'
                                : 'text-gray-500 dark:text-gray-400'
                            }`}
                          >
                            {step.title}
                          </span>
                        </div>
                        {index < steps.length - 1 && (
                          <div
                            className={`mx-4 h-0.5 w-12 transition-colors ${
                              index < currentStep
                                ? 'bg-blue-600'
                                : 'bg-gray-300 dark:bg-gray-600'
                            }`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {renderStepContent()}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={handleBack}
                  disabled={currentStep === 0}
                  className={`px-4 py-2 flex items-center space-x-2 ${
                    currentStep === 0
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
                  }`}
                >
                  <FiChevronLeft className="h-5 w-5" />
                  <span>Back</span>
                </button>

                <div className="flex items-center space-x-3">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                  >
                    Cancel
                  </button>
                  {currentStep === steps.length - 1 ? (
                    <button
                      onClick={handleComplete}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
                    >
                      <FiZap className="h-5 w-5" />
                      <span>Create Project</span>
                    </button>
                  ) : currentStep === 2 ? (
                    <button
                      onClick={handleNext}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
                    >
                      <span>Validate</span>
                      <FiChevronRight className="h-5 w-5" />
                    </button>
                  ) : (
                    <button
                      onClick={handleNext}
                      disabled={currentStep === 0 && !projectData.projectId}
                      className={`px-4 py-2 rounded-lg flex items-center space-x-2 ${
                        currentStep === 0 && !projectData.projectId
                          ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                          : 'bg-blue-600 text-white hover:bg-blue-700 transition-colors'
                      }`}
                    >
                      <span>Next</span>
                      <FiChevronRight className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ProjectOnboarding;