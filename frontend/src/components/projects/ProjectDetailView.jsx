import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  FiAlertTriangle,
  FiCheckCircle
} from 'react-icons/fi';
import TemplatesGrid from './TemplatesGrid';
import TemplateDetails from './TemplateDetails';
import TableAnalysis from './TableAnalysis';
import ConfirmDialog from '../ConfirmDialog';
import { formatCost } from '../../services/projectsMockData';
import { projectsApiService } from '../../services/projectsApiService';
import { optimizeQueryWithADK } from '../../services/adk';
// Removed analysisService - now using Firestore via API
import toast from 'react-hot-toast';

const ProjectDetailView = ({ project, onBack, onRefresh, onEdit, onRemove, onPause }) => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isTemplateDrawerOpen, setIsTemplateDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('templates');
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [analyzingTemplates, setAnalyzingTemplates] = useState(new Set());
  const [analysisResults, setAnalysisResults] = useState({});
  const [analysisStatuses, setAnalysisStatuses] = useState({});
  const [tableAnalysisSummary, setTableAnalysisSummary] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Fetch templates when component mounts or project changes
  useEffect(() => {
    let mounted = true; // Flag to prevent state updates after unmount
    
    const fetchTemplates = async () => {
      if (!mounted) return;
      setIsLoadingTemplates(true);
      
      try {
        const templatesData = await projectsApiService.getProjectTemplates(project.projectId);
        
        if (!mounted) return; // Check again after async operation
        
        // Ensure templatesData is an array
        const templates = Array.isArray(templatesData) ? templatesData : (templatesData?.templates || []);
        
        // Convert date strings to Date objects for the component
        const templatesWithDates = templates.map(template => {
          const templateWithDate = {
            ...template,
            id: template.id || template.template_id, // Map template_id to id
            firstSeen: template.firstSeen || template.first_seen ? new Date(template.firstSeen || template.first_seen) : null,
            lastSeen: template.lastSeen || template.last_seen ? new Date(template.lastSeen || template.last_seen) : null
          };
          
          // Check if template has analysis result from backend
          const analysisResult = template.analysisResult || template.analysis_result;
          if (analysisResult) {
            // Template already has analysis from backend
            console.log('Template has analysis result:', templateWithDate.id, analysisResult);
            setAnalysisResults(prev => ({
              ...prev,
              [templateWithDate.id]: analysisResult
            }));
            setAnalysisStatuses(prev => ({
              ...prev,
              [templateWithDate.id]: 'completed'
            }));
            templateWithDate.state = 'analyzed';
            templateWithDate.complianceScore = template.compliance_score || 
                                                template.optimization_score || 
                                                analysisResult.metadata?.optimizationScore;
          } else {
            // Template has no analysis yet - set status to 'new' or use existing status
            setAnalysisStatuses(prev => ({
              ...prev,
              [template.id]: template.analysisStatus || 'new'
            }));
          }
          
          return templateWithDate;
        });
        if (mounted) {
          setTemplates(templatesWithDates);
        }
      } catch (error) {
        console.error('Failed to fetch templates:', error);
        if (mounted) {
          setTemplates([]);
        }
      } finally {
        if (mounted) {
          setIsLoadingTemplates(false);
        }
      }
    };

    if (project?.projectId) {
      fetchTemplates();
    }
    
    // Cleanup function to prevent state updates after unmount
    return () => {
      mounted = false;
    };
  }, [project]);

  // Fetch table analysis summary when component mounts or project changes
  useEffect(() => {
    const fetchTableAnalysisSummary = async () => {
      if (!project?.projectId) return;
      
      try {
        const response = await fetch(
          `${import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8001'}/api/projects/${project.projectId}/table-analysis-summary`
        );
        if (response.ok) {
          const summary = await response.json();
          setTableAnalysisSummary(summary);
        }
      } catch (error) {
        console.error('Failed to fetch table analysis summary:', error);
      }
    };
    
    fetchTableAnalysisSummary();
  }, [project]);

  const handleTemplateClick = (template) => {
    setSelectedTemplate(template);
    setIsTemplateDrawerOpen(true);
  };

  const handleBulkAction = async (action, templateIds) => {
    console.log('Bulk action:', action, templateIds);
    
    if (action === 'analyze' && templateIds.length > 0) {
      // If only one template selected, open the drawer
      if (templateIds.length === 1) {
        const templateId = templateIds[0];
        const template = templates.find(t => t.id === templateId || t.template_id === templateId);
        const fullSql = template?.fullSql || template?.full_sql || template?.sql_pattern;
        
        if (!template || !fullSql) {
          console.error('Template or SQL not found:', { templateId, template });
          toast.error('Template SQL not found');
          return;
        }
        
        // Use the template's actual ID for consistency
        const actualTemplateId = template.id || template.template_id;
        
        // Mark as analyzing and set status
        setAnalyzingTemplates(prev => new Set([...prev, actualTemplateId]));
        setAnalysisStatuses(prev => ({ ...prev, [actualTemplateId]: 'analyzing' }));
        
        // Open the template drawer
        setSelectedTemplate(template);
        setIsTemplateDrawerOpen(true);
        
        // Run single analysis with the actual template ID
        await analyzeTemplate(actualTemplateId, template);
      } else {
        // Multiple templates selected - run in parallel without opening drawers
        toast.loading(`Starting analysis for ${templateIds.length} templates...`, { 
          id: 'bulk-analysis-start' 
        });
        
        // Mark all as analyzing
        setAnalyzingTemplates(prev => new Set([...prev, ...templateIds]));
        templateIds.forEach(id => {
          setAnalysisStatuses(prev => ({ ...prev, [id]: 'analyzing' }));
        });
        
        // Create analysis promises for all selected templates
        const analysisPromises = templateIds.map(async (templateId) => {
          const template = templates.find(t => t.id === templateId || t.template_id === templateId);
          const fullSql = template?.fullSql || template?.full_sql || template?.sql_pattern;
          
          if (!template || !fullSql) {
            console.error(`Template ${templateId} SQL not found`, { template });
            return { templateId, error: 'Template SQL not found' };
          }
          
          // Use the template's actual ID for consistency
          const actualTemplateId = template.id || template.template_id;
          
          try {
            const result = await analyzeTemplate(actualTemplateId, template);
            return { templateId: actualTemplateId, result };
          } catch (error) {
            console.error(`Analysis error for template ${templateId}:`, error);
            return { templateId, error: error.message };
          }
        });
        
        // Run all analyses in parallel
        const results = await Promise.all(analysisPromises);
        
        toast.dismiss('bulk-analysis-start');
        
        // Count successes and failures
        const successful = results.filter(r => r.result && !r.error).length;
        const failed = results.filter(r => r.error).length;
        
        if (successful > 0 && failed === 0) {
          toast.success(`Successfully analyzed ${successful} template(s)`);
        } else if (successful > 0 && failed > 0) {
          toast.success(`Analyzed ${successful} template(s), ${failed} failed`);
        } else {
          toast.error(`Failed to analyze ${failed} template(s)`);
        }
      }
    } else if (action === 'reanalyze') {
      // Handle re-analyze similarly
      handleBulkAction('analyze', templateIds);
    } else {
      toast.info(`Action ${action} for ${templateIds.length} template(s)`);
    }
  };
  
  // Extract the analysis logic into a separate function
  const analyzeTemplate = async (templateId, template) => {
    try {
      // Create a unique session ID for this analysis
      const sessionId = `template_${templateId}_${Date.now()}`;
      
      // Get the full SQL from template with fallback property names
      const fullSql = template.fullSql || template.full_sql || template.sql_pattern;
      
      if (!fullSql) {
        throw new Error('Template SQL not found');
      }
      
      // Get tables from template with fallback property names
      const tables = template.tables || template.tables_used || [];
      
      // Call the ADK optimization service
      const result = await optimizeQueryWithADK(fullSql, {
        sessionId: sessionId,
        projectId: project.projectId,
        datasetId: tables[0]?.split('.')[0] || 'analytics',
        userId: 'user_' + Date.now(),
        validate: true,
        onProgress: (event) => {
          console.log(`Analysis progress for ${templateId}:`, event);
          // Update analysis progress stage
          if (event.stage) {
            setAnalysisResults(prev => ({
              ...prev,
              [templateId]: { ...prev[templateId], stage: event.stage }
            }));
          }
        },
        onStageComplete: (stage, data) => {
          console.log(`Stage ${stage} complete for ${templateId}:`, data);
          // Update analysis results with stage data
          setAnalysisResults(prev => ({
            ...prev,
            [templateId]: { ...prev[templateId], stage, [stage]: data }
          }));
        }
      });
      
      if (result && !result.error) {
        // Store the analysis result
        setAnalysisResults(prev => ({
          ...prev,
          [templateId]: result
        }));
        setAnalysisStatuses(prev => ({ ...prev, [templateId]: 'completed' }));
        
        // Save analysis results to backend
        try {
          await projectsApiService.saveTemplateAnalysis(project.projectId, templateId, result);
          console.log(`Analysis result saved for template ${templateId}`);
        } catch (error) {
          console.error('Failed to save analysis:', error);
          // Continue even if save fails - result is still in memory
        }
        
        // Update template state
        setTemplates(prev => prev.map(t => 
          t.id === templateId 
            ? { ...t, state: 'analyzed', complianceScore: result.metadata?.optimizationScore }
            : t
        ));
        
        return result;
      } else {
        setAnalysisStatuses(prev => ({ ...prev, [templateId]: 'failed' }));
        throw new Error(result?.message || 'Analysis failed');
      }
    } catch (error) {
      setAnalysisStatuses(prev => ({ ...prev, [templateId]: 'failed' }));
      throw error;
    } finally {
      // Remove from analyzing set
      setAnalyzingTemplates(prev => {
        const newSet = new Set(prev);
        newSet.delete(templateId);
        return newSet;
      });
    }
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
    { id: 'templates', label: 'Query Analysis', count: templates.length },
    { id: 'tables', label: 'Table Analysis' },
    { id: 'overview', label: 'Overview' },
    { id: 'settings', label: 'Settings' },
    { id: 'activity', label: 'Activity' }
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">

      {/* Header */}
      <div className="px-4 sm:px-6 lg:px-8 pt-6 pb-3">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
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
                onClick={() => setDeleteConfirm(true)}
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
      <div className="px-4 sm:px-6 lg:px-8 py-3">
        {/* Query Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
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

        {/* Table Metrics Row (if summary is available) */}
        {tableAnalysisSummary && tableAnalysisSummary.total_tables > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Total Tables</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                    {tableAnalysisSummary.total_tables}
                  </p>
                </div>
                <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 rounded">
                  <FiDatabase className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Total Storage</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                    {tableAnalysisSummary.total_storage_gb.toFixed(1)} GB
                  </p>
                </div>
                <div className="p-2 bg-purple-50 dark:bg-purple-950/30 rounded">
                  <FiDatabase className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Storage Cost</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                    ${tableAnalysisSummary.total_storage_cost_monthly.toFixed(0)}
                  </p>
                </div>
                <div className="p-2 bg-yellow-50 dark:bg-yellow-950/30 rounded">
                  <FiDollarSign className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Unused Tables</p>
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 mt-1">
                    {tableAnalysisSummary.unused_tables_count}
                  </p>
                </div>
                <div className="p-2 bg-orange-50 dark:bg-orange-950/30 rounded">
                  <FiAlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Optimized Tables</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                    {tableAnalysisSummary.partitioned_tables_count}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {tableAnalysisSummary.clustered_tables_count} clustered
                  </p>
                </div>
                <div className="p-2 bg-green-50 dark:bg-green-950/30 rounded">
                  <FiCheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="px-4 sm:px-6 lg:px-8">
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
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'templates' && (
          isLoadingTemplates ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <TemplatesGrid
              templates={templates}
              onTemplateClick={handleTemplateClick}
              onBulkAction={handleBulkAction}
              analyzingTemplates={analyzingTemplates}
              analysisStatuses={analysisStatuses}
            />
          )
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
                    {project.lastUpdated instanceof Date ? project.lastUpdated.toLocaleString() : new Date(project.lastUpdated).toLocaleString()}
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

        {activeTab === 'tables' && (
          <TableAnalysis project={project} />
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
        analysisStatus={selectedTemplate ? analysisStatuses[selectedTemplate.id] : null}
        analysisResult={selectedTemplate ? analysisResults[selectedTemplate.id] : null}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        onConfirm={() => {
          onRemove(project.projectId || project.id);
          onBack();
          setDeleteConfirm(false);
        }}
        title="Delete Project"
        message="Are you sure you want to remove this project? This will delete all associated templates and analyses."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
};

export default ProjectDetailView;