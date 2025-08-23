import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiX,
  FiChevronRight,
  FiChevronLeft,
  FiCheck,
  FiAlertTriangle,
  FiCheckCircle,
  FiXCircle,
  FiLoader
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { projectsApiService } from '../../services/projectsApiService';

const ProjectOnboarding = ({ isOpen, onClose, onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [projectData, setProjectData] = useState({
    projectId: '',
    name: '',
    analysisWindow: 30,
    customDateRange: false,
    startDate: '',
    endDate: '',
    region: 'us',
    pricingMode: 'on-demand',
    pricePerTB: 5.00,
    useCustomTables: false,
    customJobsTable: '',
    customJobsByProjectTable: '',
    customTableStorageTable: '',
    customTablesTable: ''
  });
  const [isValidating, setIsValidating] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [permissions, setPermissions] = useState({
    information_schema_jobs: null,
    information_schema_jobs_by_project: null,
    information_schema_table_storage: null,
    information_schema_tables: null,
    bigquery_jobs_create: null,
    bigquery_tables_get: null
  });
  const [discoveryData, setDiscoveryData] = useState({
    queryTemplates: [],
    tables: [],
    totalQueries: 0,
    totalDataScanned: 0
  });

  // Reset all form state when modal opens or closes
  React.useEffect(() => {
    if (isOpen) {
      // Reset everything to initial state when modal opens
      setCurrentStep(0);
      setProjectData({
        projectId: '',
        name: '',
        analysisWindow: 30,
        customDateRange: false,
        startDate: '',
        endDate: '',
        region: 'us',
        pricingMode: 'on-demand',
        pricePerTB: 5.00,
        useCustomTables: false,
        customJobsTable: '',
        customJobsByProjectTable: '',
        customTableStorageTable: '',
        customTablesTable: ''
      });
      setIsValidating(false);
      setIsCreating(false);
      setValidationResult(null);
      setPermissions({
        information_schema_jobs: null,
        information_schema_jobs_by_project: null,
        information_schema_table_storage: null,
        information_schema_tables: null,
        bigquery_jobs_create: null,
        bigquery_tables_get: null
      });
      setDiscoveryData({
        queryTemplates: [],
        tables: [],
        totalQueries: 0,
        totalDataScanned: 0
      });
    }
  }, [isOpen]);

  const steps = [
    { id: 'project', title: 'Project Details' },
    { id: 'settings', title: 'Analysis Settings' },
    { id: 'validation', title: 'Validation' },
    { id: 'review', title: 'Review & Create' }
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

  const checkPermissions = async (updateProgress = false) => {
    try {
      // Use custom tables if specified, otherwise default
      const jobsTable = projectData.useCustomTables && projectData.customJobsTable 
        ? projectData.customJobsTable 
        : 'INFORMATION_SCHEMA.JOBS';
      
      const jobsByProjectTable = projectData.useCustomTables && projectData.customJobsByProjectTable
        ? projectData.customJobsByProjectTable
        : 'INFORMATION_SCHEMA.JOBS_BY_PROJECT';
        
      const tableStorageTable = projectData.useCustomTables && projectData.customTableStorageTable
        ? projectData.customTableStorageTable
        : 'INFORMATION_SCHEMA.TABLE_STORAGE';
        
      const tablesTable = projectData.useCustomTables && projectData.customTablesTable
        ? projectData.customTablesTable
        : 'INFORMATION_SCHEMA.TABLES';
      
      // Check INFORMATION_SCHEMA.JOBS access
      if (updateProgress) {
        setPermissions(prev => ({ ...prev, information_schema_jobs: 'checking' }));
      }
      const jobsCheck = await projectsApiService.checkTableAccess(
        projectData.projectId,
        jobsTable,
        projectData.region
      );
      if (updateProgress) {
        setPermissions(prev => ({ ...prev, information_schema_jobs: jobsCheck }));
      }
      
      // Check INFORMATION_SCHEMA.JOBS_BY_PROJECT access
      if (updateProgress) {
        setPermissions(prev => ({ ...prev, information_schema_jobs_by_project: 'checking' }));
      }
      const jobsByProjectCheck = await projectsApiService.checkTableAccess(
        projectData.projectId,
        jobsByProjectTable,
        projectData.region
      );
      if (updateProgress) {
        setPermissions(prev => ({ ...prev, information_schema_jobs_by_project: jobsByProjectCheck }));
      }
      
      // Check INFORMATION_SCHEMA.TABLE_STORAGE access
      if (updateProgress) {
        setPermissions(prev => ({ ...prev, information_schema_table_storage: 'checking' }));
      }
      const tableStorageCheck = await projectsApiService.checkTableAccess(
        projectData.projectId,
        tableStorageTable,
        projectData.region
      );
      if (updateProgress) {
        setPermissions(prev => ({ ...prev, information_schema_table_storage: tableStorageCheck }));
      }
      
      // Check INFORMATION_SCHEMA.TABLES access
      if (updateProgress) {
        setPermissions(prev => ({ ...prev, information_schema_tables: 'checking' }));
      }
      const tablesCheck = await projectsApiService.checkTableAccess(
        projectData.projectId,
        tablesTable,
        projectData.region
      );
      if (updateProgress) {
        setPermissions(prev => ({ ...prev, information_schema_tables: tablesCheck }));
      }
      
      // Check BigQuery IAM permissions
      if (updateProgress) {
        setPermissions(prev => ({ ...prev, bigquery_jobs_create: 'checking', bigquery_tables_get: 'checking' }));
      }
      const iamPermissions = await projectsApiService.checkIAMPermissions(
        projectData.projectId,
        ['bigquery.jobs.create', 'bigquery.tables.get']
      );
      if (updateProgress) {
        setPermissions(prev => ({ 
          ...prev, 
          bigquery_jobs_create: iamPermissions.includes('bigquery.jobs.create'),
          bigquery_tables_get: iamPermissions.includes('bigquery.tables.get')
        }));
      }
      
      return {
        information_schema_jobs: jobsCheck,
        information_schema_jobs_by_project: jobsByProjectCheck,
        information_schema_table_storage: tableStorageCheck,
        information_schema_tables: tablesCheck,
        bigquery_jobs_create: iamPermissions.includes('bigquery.jobs.create'),
        bigquery_tables_get: iamPermissions.includes('bigquery.tables.get'),
        custom_tables_used: projectData.useCustomTables,
        jobs_table: jobsTable,
        jobs_by_project_table: jobsByProjectTable,
        table_storage_table: tableStorageTable,
        tables_table: tablesTable
      };
    } catch (error) {
      console.error('Permission check failed:', error);
      return {
        information_schema_jobs: false,
        information_schema_jobs_by_project: false,
        information_schema_table_storage: false,
        information_schema_tables: false,
        bigquery_jobs_create: false,
        bigquery_tables_get: false,
        custom_tables_used: false
      };
    }
  };

  const performValidation = async () => {
    setIsValidating(true);
    
    try {
      // Check permissions first with inline progress updates
      const permissionResults = await checkPermissions(true);
      
      // Check if we have at least one INFORMATION_SCHEMA access
      const hasInfoSchemaAccess = 
        permissionResults.information_schema_jobs || 
        permissionResults.information_schema_jobs_by_project;
      
      if (!hasInfoSchemaAccess) {
        setValidationResult({
          success: false,
          error: 'No access to INFORMATION_SCHEMA. Please ensure you have the required permissions.',
          permissions: permissionResults
        });
        setIsValidating(false);
        setCurrentStep(3);
        return;
      }
      
      // Run a test query to validate access and get discovery data
      const testResult = await projectsApiService.validateProjectAccess({
        projectId: projectData.projectId,
        analysisWindow: projectData.customDateRange 
          ? { startDate: projectData.startDate, endDate: projectData.endDate }
          : projectData.analysisWindow,
        customTables: projectData.useCustomTables ? {
          jobs_table: projectData.customJobsTable,
          jobs_by_project_table: projectData.customJobsByProjectTable,
          table_storage_table: projectData.customTableStorageTable,
          tables_table: projectData.customTablesTable
        } : null
      });
      
      // Extract discovery data if available
      if (testResult.discoveryData) {
        setDiscoveryData({
          queryTemplates: testResult.discoveryData.templates || [],
          tables: testResult.discoveryData.tables || [],
          totalQueries: testResult.discoveryData.totalQueries || testResult.jobsFound || 0,
          totalDataScanned: testResult.discoveryData.totalDataScanned || 0
        });
      }
      
      setValidationResult({
        success: true,
        permissions: permissionResults,
        jobsFound: testResult.jobsFound || 0,
        estimatedTemplates: testResult.estimatedTemplates || 0,
        warnings: []
      });
      
      setIsValidating(false);
      setCurrentStep(3);
    } catch (error) {
      setValidationResult({
        success: false,
        error: error.message,
        permissions: permissions
      });
      setIsValidating(false);
      setCurrentStep(3);
    }
  };

  const handleComplete = async () => {
    // Show loading state immediately
    setIsCreating(true);
    
    try {
      // Create project immediately
      const createResponse = await fetch(`${import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8001'}/api/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: projectData.projectId,
          display_name: projectData.name || projectData.projectId,
          analysis_window: projectData.analysisWindow,
          region: projectData.region,
          regions: [],
          datasets: [],
          pricing_mode: projectData.pricingMode,
          price_per_tb: projectData.pricePerTB,
          auto_detect_regions: false,
          auto_detect_datasets: false
        })
      });

      if (!createResponse.ok) {
        const error = await createResponse.json();
        throw new Error(error.detail || 'Failed to create project');
      }

      const projectResult = await createResponse.json();
      
      toast.success('Project created! Running analysis in background...');
      onComplete(projectResult);
      onClose();

      // Start the INFORMATION_SCHEMA scan in background
      fetch(`${import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8001'}/api/projects/scan-information-schema`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: projectData.projectId,
          region: projectData.region,
          analysis_window: projectData.customDateRange 
            ? { startDate: projectData.startDate, endDate: projectData.endDate }
            : projectData.analysisWindow,
          price_per_tb: projectData.pricePerTB,
          custom_tables: projectData.useCustomTables ? {
            jobs_table: projectData.customJobsTable,
            jobs_by_project_table: projectData.customJobsByProjectTable,
            table_storage_table: projectData.customTableStorageTable,
            tables_table: projectData.customTablesTable
          } : null
        })
      }).then(response => {
        if (response.ok) {
          return response.json();
        }
        throw new Error('Scan failed');
      }).then(scanResult => {
        if (scanResult.success) {
          toast.success(`Analysis complete! Found ${scanResult.templates_discovered} query templates.`);
          // Trigger a refresh of the parent component if onComplete returns a refresh function
          if (typeof onComplete === 'function') {
            onComplete({ ...projectResult, refresh: true });
          }
        }
      }).catch(error => {
        console.error('Background scan error:', error);
        toast.error('Background analysis failed. Please refresh to see results.');
      });
      
    } catch (error) {
      console.error('Create project error:', error);
      toast.error('Failed to create project: ' + error.message);
      setIsCreating(false);
    }
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

          </div>
        );

      case 1:
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                BigQuery Region
              </label>
              <select
                value={projectData.region}
                onChange={(e) => setProjectData({ ...projectData, region: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="us">US (region-us)</option>
                <option value="eu">EU (region-eu)</option>
                <option value="asia-northeast1">Asia Northeast 1 (region-asia-northeast1)</option>
                <option value="us-central1">US Central 1 (region-us-central1)</option>
                <option value="europe-west1">Europe West 1 (region-europe-west1)</option>
                <option value="asia-southeast1">Asia Southeast 1 (region-asia-southeast1)</option>
                <option value="australia-southeast1">Australia Southeast 1 (region-australia-southeast1)</option>
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Select the region where your BigQuery datasets are located
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Analysis Window
              </label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="analysisType"
                    checked={!projectData.customDateRange}
                    onChange={() => setProjectData({ ...projectData, customDateRange: false })}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    Last N days
                  </span>
                </label>
                {!projectData.customDateRange && (
                  <select
                    value={projectData.analysisWindow}
                    onChange={(e) => setProjectData({ ...projectData, analysisWindow: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 ml-6"
                  >
                    <option value={7}>Last 7 days</option>
                    <option value={30}>Last 30 days (Recommended)</option>
                    <option value={60}>Last 60 days</option>
                    <option value={90}>Last 90 days</option>
                  </select>
                )}
                
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="analysisType"
                    checked={projectData.customDateRange}
                    onChange={() => setProjectData({ ...projectData, customDateRange: true })}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    Custom date range
                  </span>
                </label>
                {projectData.customDateRange && (
                  <div className="grid grid-cols-2 gap-4 ml-6">
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={projectData.startDate}
                        onChange={(e) => setProjectData({ ...projectData, startDate: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                        End Date
                      </label>
                      <input
                        type="date"
                        value={projectData.endDate}
                        onChange={(e) => setProjectData({ ...projectData, endDate: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Time period to analyze for query patterns
              </p>
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

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Advanced: Custom INFORMATION_SCHEMA Tables
              </label>
              <div className="space-y-3">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={projectData.useCustomTables}
                    onChange={(e) => setProjectData({ ...projectData, useCustomTables: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    Use custom table names (optional)
                  </span>
                </label>
                
                {projectData.useCustomTables && (
                  <div className="ml-6 space-y-3 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                        JOBS_BY_PROJECT Table * (required)
                      </label>
                      <input
                        type="text"
                        value={projectData.customJobsByProjectTable}
                        onChange={(e) => setProjectData({ ...projectData, customJobsByProjectTable: e.target.value })}
                        placeholder="project.custom_information_schema.JOBS_BY_PROJECT"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                        TABLE_STORAGE Table * (required)
                      </label>
                      <input
                        type="text"
                        value={projectData.customTableStorageTable}
                        onChange={(e) => setProjectData({ ...projectData, customTableStorageTable: e.target.value })}
                        placeholder="project.custom_information_schema.TABLE_STORAGE"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                        TABLES Table * (required)
                      </label>
                      <input
                        type="text"
                        value={projectData.customTablesTable}
                        onChange={(e) => setProjectData({ ...projectData, customTablesTable: e.target.value })}
                        placeholder="project.custom_information_schema.TABLES"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                    
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Specify fully qualified table names if your INFORMATION_SCHEMA tables are in specific regions or have custom names
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="space-y-6">
              
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  {isValidating ? 'Checking access...' : 'Access requirements:'}
                </h4>
                
                <div className="space-y-4">
                  {/* INFORMATION_SCHEMA Tables */}
                  <div>
                    <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
                      INFORMATION_SCHEMA Tables
                    </h5>
                    <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                      <li className="flex items-center justify-between">
                        <span className="flex items-center">
                          {permissions.information_schema_jobs === null ? (
                            <FiCheckCircle className="h-4 w-4 mr-2 text-gray-400" />
                          ) : permissions.information_schema_jobs === 'checking' ? (
                            <FiLoader className="h-4 w-4 mr-2 text-blue-500 animate-spin" />
                          ) : permissions.information_schema_jobs ? (
                            <FiCheckCircle className="h-4 w-4 mr-2 text-green-500" />
                          ) : (
                            <FiXCircle className="h-4 w-4 mr-2 text-red-500" />
                          )}
                          JOBS
                        </span>
                        {permissions.information_schema_jobs === 'checking' && (
                          <span className="text-xs text-blue-500">Checking...</span>
                        )}
                      </li>
                      <li className="flex items-center justify-between">
                        <span className="flex items-center">
                          {permissions.information_schema_jobs_by_project === null ? (
                            <FiCheckCircle className="h-4 w-4 mr-2 text-gray-400" />
                          ) : permissions.information_schema_jobs_by_project === 'checking' ? (
                            <FiLoader className="h-4 w-4 mr-2 text-blue-500 animate-spin" />
                          ) : permissions.information_schema_jobs_by_project ? (
                            <FiCheckCircle className="h-4 w-4 mr-2 text-green-500" />
                          ) : (
                            <FiXCircle className="h-4 w-4 mr-2 text-red-500" />
                          )}
                          JOBS_BY_PROJECT
                        </span>
                        {permissions.information_schema_jobs_by_project === 'checking' && (
                          <span className="text-xs text-blue-500">Checking...</span>
                        )}
                      </li>
                      <li className="flex items-center justify-between">
                        <span className="flex items-center">
                          {permissions.information_schema_table_storage === null ? (
                            <FiCheckCircle className="h-4 w-4 mr-2 text-gray-400" />
                          ) : permissions.information_schema_table_storage === 'checking' ? (
                            <FiLoader className="h-4 w-4 mr-2 text-blue-500 animate-spin" />
                          ) : permissions.information_schema_table_storage ? (
                            <FiCheckCircle className="h-4 w-4 mr-2 text-green-500" />
                          ) : (
                            <FiXCircle className="h-4 w-4 mr-2 text-red-500" />
                          )}
                          TABLE_STORAGE
                        </span>
                        {permissions.information_schema_table_storage === 'checking' && (
                          <span className="text-xs text-blue-500">Checking...</span>
                        )}
                      </li>
                      <li className="flex items-center justify-between">
                        <span className="flex items-center">
                          {permissions.information_schema_tables === null ? (
                            <FiCheckCircle className="h-4 w-4 mr-2 text-gray-400" />
                          ) : permissions.information_schema_tables === 'checking' ? (
                            <FiLoader className="h-4 w-4 mr-2 text-blue-500 animate-spin" />
                          ) : permissions.information_schema_tables ? (
                            <FiCheckCircle className="h-4 w-4 mr-2 text-green-500" />
                          ) : (
                            <FiXCircle className="h-4 w-4 mr-2 text-red-500" />
                          )}
                          TABLES
                        </span>
                        {permissions.information_schema_tables === 'checking' && (
                          <span className="text-xs text-blue-500">Checking...</span>
                        )}
                      </li>
                    </ul>
                  </div>
                  
                  {/* BigQuery Permissions */}
                  <div>
                    <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
                      BigQuery Permissions
                    </h5>
                    <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                      <li className="flex items-center justify-between">
                        <span className="flex items-center">
                          {permissions.bigquery_jobs_create === null ? (
                            <FiCheckCircle className="h-4 w-4 mr-2 text-gray-400" />
                          ) : permissions.bigquery_jobs_create === 'checking' ? (
                            <FiLoader className="h-4 w-4 mr-2 text-blue-500 animate-spin" />
                          ) : permissions.bigquery_jobs_create ? (
                            <FiCheckCircle className="h-4 w-4 mr-2 text-green-500" />
                          ) : (
                            <FiXCircle className="h-4 w-4 mr-2 text-red-500" />
                          )}
                          bigquery.jobs.create
                        </span>
                        {permissions.bigquery_jobs_create === 'checking' && (
                          <span className="text-xs text-blue-500">Checking...</span>
                        )}
                      </li>
                      <li className="flex items-center justify-between">
                        <span className="flex items-center">
                          {permissions.bigquery_tables_get === null ? (
                            <FiCheckCircle className="h-4 w-4 mr-2 text-gray-400" />
                          ) : permissions.bigquery_tables_get === 'checking' ? (
                            <FiLoader className="h-4 w-4 mr-2 text-blue-500 animate-spin" />
                          ) : permissions.bigquery_tables_get ? (
                            <FiCheckCircle className="h-4 w-4 mr-2 text-green-500" />
                          ) : (
                            <FiXCircle className="h-4 w-4 mr-2 text-red-500" />
                          )}
                          bigquery.tables.get
                        </span>
                        {permissions.bigquery_tables_get === 'checking' && (
                          <span className="text-xs text-blue-500">Checking...</span>
                        )}
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
              
              {isValidating && (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Discovering query templates and analyzing tables...
                  </p>
                </div>
              )}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            {validationResult && (
              <>
                {validationResult.success ? (
                  <>

                    <div>
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        Permission Check Results
                      </h3>
                      <div className="space-y-3">
                        <div>
                          <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
                            INFORMATION_SCHEMA Tables
                          </h5>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between py-1 px-3 bg-gray-50 dark:bg-gray-900/50 rounded">
                              <span className="text-sm text-gray-600 dark:text-gray-400">JOBS</span>
                              {validationResult.permissions.information_schema_jobs ? (
                                <FiCheckCircle className="h-4 w-4 text-green-500" />
                              ) : (
                                <FiXCircle className="h-4 w-4 text-red-500" />
                              )}
                            </div>
                            <div className="flex items-center justify-between py-1 px-3 bg-gray-50 dark:bg-gray-900/50 rounded">
                              <span className="text-sm text-gray-600 dark:text-gray-400">JOBS_BY_PROJECT</span>
                              {validationResult.permissions.information_schema_jobs_by_project ? (
                                <FiCheckCircle className="h-4 w-4 text-green-500" />
                              ) : (
                                <FiXCircle className="h-4 w-4 text-red-500" />
                              )}
                            </div>
                            <div className="flex items-center justify-between py-1 px-3 bg-gray-50 dark:bg-gray-900/50 rounded">
                              <span className="text-sm text-gray-600 dark:text-gray-400">TABLE_STORAGE</span>
                              {validationResult.permissions.information_schema_table_storage ? (
                                <FiCheckCircle className="h-4 w-4 text-green-500" />
                              ) : (
                                <FiXCircle className="h-4 w-4 text-red-500" />
                              )}
                            </div>
                            <div className="flex items-center justify-between py-1 px-3 bg-gray-50 dark:bg-gray-900/50 rounded">
                              <span className="text-sm text-gray-600 dark:text-gray-400">TABLES</span>
                              {validationResult.permissions.information_schema_tables ? (
                                <FiCheckCircle className="h-4 w-4 text-green-500" />
                              ) : (
                                <FiXCircle className="h-4 w-4 text-red-500" />
                              )}
                            </div>
                          </div>
                        </div>
                        <div>
                          <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
                            BigQuery Permissions
                          </h5>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between py-1 px-3 bg-gray-50 dark:bg-gray-900/50 rounded">
                              <span className="text-sm text-gray-600 dark:text-gray-400">bigquery.jobs.create</span>
                              {validationResult.permissions.bigquery_jobs_create ? (
                                <FiCheckCircle className="h-4 w-4 text-green-500" />
                              ) : (
                                <FiXCircle className="h-4 w-4 text-red-500" />
                              )}
                            </div>
                            <div className="flex items-center justify-between py-1 px-3 bg-gray-50 dark:bg-gray-900/50 rounded">
                              <span className="text-sm text-gray-600 dark:text-gray-400">bigquery.tables.get</span>
                              {validationResult.permissions.bigquery_tables_get ? (
                                <FiCheckCircle className="h-4 w-4 text-green-500" />
                              ) : (
                                <FiXCircle className="h-4 w-4 text-red-500" />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    
                    {discoveryData.queryTemplates.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                          Discovered Query Templates
                        </h3>
                        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 max-h-48 overflow-y-auto">
                          <ul className="space-y-2">
                            {discoveryData.queryTemplates.slice(0, 5).map((template, index) => (
                              <li key={index} className="text-sm">
                                <div className="flex items-start">
                                  <span className="text-gray-500 dark:text-gray-400 mr-2">{index + 1}.</span>
                                  <div className="flex-1">
                                    <div className="text-gray-700 dark:text-gray-300 font-mono text-xs truncate">
                                      {template.pattern || template.query_pattern || template}
                                    </div>
                                    {template.count && (
                                      <span className="text-xs text-gray-500 dark:text-gray-400">
                                        {template.count} occurrences
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </li>
                            ))}
                            {discoveryData.queryTemplates.length > 5 && (
                              <li className="text-sm text-gray-500 dark:text-gray-400 italic">
                                ... and {discoveryData.queryTemplates.length - 5} more templates
                              </li>
                            )}
                          </ul>
                        </div>
                      </div>
                    )}
                    
                    {discoveryData.tables.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                          Table Analysis
                        </h3>
                        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 max-h-48 overflow-y-auto">
                          <ul className="space-y-2">
                            {discoveryData.tables.slice(0, 5).map((table, index) => (
                              <li key={index} className="text-sm">
                                <div className="flex justify-between">
                                  <span className="text-gray-700 dark:text-gray-300 font-mono text-xs">
                                    {table.table_name || table.name || table}
                                  </span>
                                  {table.size_gb && (
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                      {table.size_gb.toFixed(2)} GB
                                    </span>
                                  )}
                                </div>
                              </li>
                            ))}
                            {discoveryData.tables.length > 5 && (
                              <li className="text-sm text-gray-500 dark:text-gray-400 italic">
                                ... and {discoveryData.tables.length - 5} more tables
                              </li>
                            )}
                          </ul>
                        </div>
                      </div>
                    )}

                    <div>
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        Configuration Summary
                      </h3>
                      <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                        <dl className="space-y-2">
                          <div className="flex justify-between">
                            <dt className="text-sm text-gray-600 dark:text-gray-400">Project ID:</dt>
                            <dd className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {projectData.projectId}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-sm text-gray-600 dark:text-gray-400">Display Name:</dt>
                            <dd className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {projectData.name || projectData.projectId}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-sm text-gray-600 dark:text-gray-400">Region:</dt>
                            <dd className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              region-{projectData.region}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-sm text-gray-600 dark:text-gray-400">Analysis Period:</dt>
                            <dd className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {projectData.customDateRange 
                                ? `${projectData.startDate} to ${projectData.endDate}`
                                : `Last ${projectData.analysisWindow} days`}
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
                  </>
                ) : (
                  <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <div className="flex">
                      <FiXCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-red-800 dark:text-red-300">
                          Validation Failed
                        </h3>
                        <p className="mt-1 text-sm text-red-700 dark:text-red-400">
                          {validationResult.error}
                        </p>
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
            onClick={() => {
              // Call onClose which will trigger the useEffect to reset state
              onClose();
            }}
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
                  onClick={() => {
                    // Call onClose which will trigger the useEffect to reset state
                    onClose();
                  }}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <FiX className="h-5 w-5" />
                </button>
              </div>

              {/* Progress Steps - Fixed Design */}
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                <div className="flex items-center justify-between">
                  {steps.map((step, index) => {
                    return (
                      <React.Fragment key={step.id}>
                        <div className="flex items-center">
                          <div
                            className={`flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors ${
                              index <= currentStep
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-400'
                            }`}
                          >
                            <FiCheck className="h-5 w-5" />
                          </div>
                          <div className="ml-3">
                            <p className={`text-sm font-medium ${
                              index <= currentStep
                                ? 'text-gray-900 dark:text-gray-100'
                                : 'text-gray-500 dark:text-gray-400'
                            }`}>
                              {step.title}
                            </p>
                          </div>
                        </div>
                        {index < steps.length - 1 && (
                          <div className={`flex-1 h-0.5 mx-4 transition-colors ${
                            index < currentStep
                              ? 'bg-blue-600'
                              : 'bg-gray-300 dark:bg-gray-600'
                          }`} />
                        )}
                      </React.Fragment>
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
                  <FiChevronLeft className="h-4 w-4" />
                  <span>Back</span>
                </button>

                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => {
                      // Call onClose which will trigger the useEffect to reset state
                      onClose();
                    }}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                  >
                    Cancel
                  </button>
                  
                  {currentStep === steps.length - 1 ? (
                    <button
                      onClick={handleComplete}
                      disabled={!validationResult?.success || isCreating}
                      className={`px-6 py-2 rounded-lg font-medium flex items-center space-x-2 ${
                        validationResult?.success && !isCreating
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      {isCreating ? (
                        <>
                          <FiLoader className="animate-spin h-4 w-4" />
                          <span>Creating...</span>
                        </>
                      ) : (
                        <>
                          <span>Create Project</span>
                          <FiCheck className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  ) : currentStep === 2 ? (
                    <button
                      onClick={handleNext}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center space-x-2"
                    >
                      <span>Validate</span>
                      <FiChevronRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      onClick={handleNext}
                      disabled={!projectData.projectId}
                      className={`px-6 py-2 rounded-lg font-medium flex items-center space-x-2 ${
                        projectData.projectId
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      <span>Next</span>
                      <FiChevronRight className="h-4 w-4" />
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