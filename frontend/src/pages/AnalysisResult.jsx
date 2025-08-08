import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import MonacoEditor from '@monaco-editor/react';
import { FiArrowLeft, FiCheck, FiX, FiAlertTriangle, FiInfo, FiDollarSign, FiCopy, FiShare2, FiPlay, FiDatabase, FiSearch, FiEdit3, FiCheckCircle, FiPlus } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { analyses } from '../services/database';
import { mockOptimizationService, createProgressTracker } from '../services/mockData';
import { optimizeQueryWithADK, testADKConnection } from '../services/adk';

const AnalysisResult = () => {
  const { analysisId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isNew = location.state?.isNew || false;
  
  const [activeTab, setActiveTab] = useState('issues');
  const [currentStep, setCurrentStep] = useState(-1);
  const [query, setQuery] = useState(location.state?.query || `SELECT * 
FROM sales_data 
WHERE region = 'US'`);
  const [options, setOptions] = useState(location.state?.options || {
    rewrite: true,
    validate: false,
    projectName: 'Default Project'
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [showProgress, setShowProgress] = useState(false);
  const [mode, setMode] = useState(isNew ? 'edit' : 'view');
  const [hasChanges, setHasChanges] = useState(false);
  const [originalQuery, setOriginalQuery] = useState(null);
  const [originalOptions, setOriginalOptions] = useState(null);
  const [analysisStatus, setAnalysisStatus] = useState('idle');
  const [backendStatus, setBackendStatus] = useState(null);
  const [stageData, setStageData] = useState({
    metadata: null,
    rules: null,
    optimization: null,
    report: null,
    validation: null
  });
  const [selectedStage, setSelectedStage] = useState(null);

  // Load existing analysis from IndexedDB
  useEffect(() => {
    if (!isNew) {
      loadExistingAnalysis();
    }
  }, [analysisId, isNew]);

  const loadExistingAnalysis = async () => {
    try {
      const existingAnalysis = await analyses.getByAnalysisId(analysisId);
      if (existingAnalysis) {
        setQuery(existingAnalysis.query || existingAnalysis.originalQuery);
        setOptions(existingAnalysis.options || {
          rewrite: true,
          validate: false,
          projectName: 'Default Project'
        });
        setResult({
          originalQuery: existingAnalysis.originalQuery,
          optimizedQuery: existingAnalysis.optimizedQuery,
          issues: existingAnalysis.issues,
          validationResult: existingAnalysis.validationResult,
          metadata: existingAnalysis.metadata
        });
        
        // Load stage data if available
        if (existingAnalysis.metadata?.stages) {
          setStageData(existingAnalysis.metadata.stages);
        }
        
        setOriginalQuery(existingAnalysis.query || existingAnalysis.originalQuery);
        setOriginalOptions(existingAnalysis.options);
        setMode('view');
      } else {
        setMode('edit');
      }
    } catch (error) {
      console.error('Error loading analysis:', error);
      setMode('edit');
    }
  };

  // Track changes when in view mode
  useEffect(() => {
    if (mode === 'view' && originalQuery && originalOptions) {
      const queryChanged = query !== originalQuery;
      const optionsChanged = JSON.stringify(options) !== JSON.stringify(originalOptions);
      setHasChanges(queryChanged || optionsChanged);
    }
  }, [query, options, originalQuery, originalOptions, mode]);

  // Auto-save query changes to localStorage
  useEffect(() => {
    if (mode === 'edit') {
      const saveTimer = setTimeout(() => {
        localStorage.setItem(`analysis-${analysisId}`, JSON.stringify({
          query,
          options,
          timestamp: Date.now()
        }));
      }, 500);
      return () => clearTimeout(saveTimer);
    }
  }, [query, options, analysisId, mode]);

  // Load saved state from localStorage on mount
  useEffect(() => {
    if (isNew || mode === 'edit') {
      const saved = localStorage.getItem(`analysis-${analysisId}`);
      if (saved) {
        const data = JSON.parse(saved);
        setQuery(data.query);
        setOptions(data.options);
      }
    }
  }, [analysisId, isNew]);

  const simulateProgress = async () => {
    const steps = options.validate ? 
      [
        { delay: 800, step: 0, name: 'Metadata' },
        { delay: 1500, step: 1, name: 'Analysis' },
        { delay: 1200, step: 2, name: 'Optimization' },
        { delay: 1000, step: 3, name: 'Validation' },
      ] : [
        { delay: 800, step: 0, name: 'Metadata' },
        { delay: 1500, step: 1, name: 'Analysis' },
        { delay: 1200, step: 2, name: 'Optimization' },
      ];

    for (const { delay, step, name } of steps) {
      console.log(`Processing step ${step}: ${name}`);
      setCurrentStep(step);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    // Mark as complete
    setCurrentStep(steps.length);
    console.log('All steps completed');
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setShowProgress(true);
    setCurrentStep(0);
    setResult(null);
    setHasChanges(false);
    setAnalysisStatus('processing');
    setStageData({
      metadata: null,
      rules: null,
      optimization: null,
      report: null,
      validation: null
    });
    setSelectedStage(null);
    
    try {
      // Try to use ADK backend first, fallback to mock if not available
      let optimizationResult;
      const isADKAvailable = await testADKConnection();
      
      if (isADKAvailable) {
        console.log('Attempting to use ADK backend for optimization');
        try {
          optimizationResult = await optimizeQueryWithADK(query, {
            projectId: 'aiva-e74f3',
            validate: options.validate,
            onProgress: (event) => {
              console.log('ADK Progress:', event);
              
              // Update progress stepper based on stage
              if (event.stage === 'metadata') {
                setCurrentStep(0);
              } else if (event.stage === 'analysis') {
                setCurrentStep(1);
              } else if (event.stage === 'optimization') {
                setCurrentStep(2);
              } else if (event.stage === 'finalizing') {
                setCurrentStep(3);
              } else if (event.stage === 'validation' && options.validate) {
                setCurrentStep(4);
              }
              
              // Show stage message
              if (event.message) {
                console.log('Stage update:', event.message);
              }
            },
            onStageComplete: (stage, data) => {
              // Store stage data for display
              setStageData(prev => ({
                ...prev,
                [stage]: data
              }));
              
              // Auto-progress to next stage
              if (stage === 'metadata') {
                setCurrentStep(1); // Start rules analysis
              } else if (stage === 'rules') {
                setCurrentStep(2); // Start optimization
              } else if (stage === 'optimization') {
                setCurrentStep(3); // Start final report
              } else if (stage === 'report' && options.validate) {
                setCurrentStep(4); // Start validation
              }
            }
          });
          
          // Check if we got an error response
          if (optimizationResult.error) {
            console.error('Vertex AI Error:', optimizationResult);
            
            // Show error in UI
            toast.error('Vertex AI is not available', {
              duration: 6000,
            });
            
            // Display detailed error message
            const errorMessage = optimizationResult.message || 'Service unavailable';
            const suggestions = optimizationResult.suggestions || [];
            
            setResult({
              error: true,
              errorType: optimizationResult.error,
              message: errorMessage,
              suggestions: suggestions,
              details: optimizationResult.details
            });
            
            setBackendStatus({
              service: 'error',
              message: errorMessage,
              suggestions: suggestions
            });
            
            // Stop processing
            setLoading(false);
            setShowProgress(false);
            setCurrentStep(-1);
            setAnalysisStatus('failed');
            return;
          }
          
          // Success - we have optimization results
          setBackendStatus({
            service: 'vertex_ai',
            message: 'Successfully optimized with Vertex AI',
            debug: optimizationResult.metadata
          });
          
        } catch (error) {
          console.error('ADK request failed:', error);
          
          // Network or other error
          toast.error('Failed to connect to optimization service', {
            duration: 5000,
          });
          
          setResult({
            error: true,
            errorType: 'connection_error',
            message: 'Could not connect to the optimization service',
            suggestions: [
              'Check if the backend server is running (port 8000)',
              'Verify your network connection',
              'Check the browser console for details'
            ]
          });
          
          setBackendStatus({
            service: 'error',
            message: 'Connection failed',
            error: error.message
          });
          
          setLoading(false);
          setShowProgress(false);
          setCurrentStep(-1);
          setAnalysisStatus('failed');
          return;
        }
      } else {
        console.log('ADK backend not available');
        
        toast.error('Backend service is not running', {
          duration: 5000,
        });
        
        setResult({
          error: true,
          errorType: 'backend_unavailable',
          message: 'The optimization backend is not running',
          suggestions: [
            'Start the backend server: cd backend && make run',
            'Or use the start script: ./start.sh',
            'Check that port 8000 is not blocked'
          ]
        });
        
        setBackendStatus({
          service: 'unavailable',
          message: 'Backend service not detected'
        });
        
        setLoading(false);
        setShowProgress(false);
        setCurrentStep(-1);
        setAnalysisStatus('failed');
        return;
      }
      
      // Save to IndexedDB with merged stage data
      await analyses.create({
        analysisId,
        query,
        originalQuery: optimizationResult.originalQuery,
        optimizedQuery: optimizationResult.optimizedQuery,
        issues: optimizationResult.issues,
        validationResult: optimizationResult.validationResult,
        metadata: {
          ...optimizationResult.metadata,
          stages: {
            ...stageData,
            ...(optimizationResult.metadata?.stages || {})
          }
        },
        options
      });
      
      // Create final result with all accumulated stage data
      const finalResult = {
        ...optimizationResult,
        metadata: {
          ...optimizationResult.metadata,
          stages: {
            ...stageData,
            ...(optimizationResult.metadata?.stages || {})
          }
        }
      };
      
      setResult(finalResult);
      setMode('view');
      setOriginalQuery(query);
      setOriginalOptions(options);
      setAnalysisStatus('completed');
      
      // Clear localStorage after successful analysis
      localStorage.removeItem(`analysis-${analysisId}`);
      
      toast.success('Query analyzed successfully!');
      
      // Hide progress after a short delay
      setTimeout(() => {
        setShowProgress(false);
        setCurrentStep(-1);
      }, 1000);
      
    } catch (error) {
      setAnalysisStatus('failed');
      setCurrentStep(-1);
      toast.error('Failed to analyze query: ' + error.message);
      setTimeout(() => {
        setShowProgress(false);
      }, 1000);
    } finally {
      setLoading(false);
    }
  };

  const handleEditMode = () => {
    setMode('edit');
    setHasChanges(false);
  };

  const handleCancelEdit = () => {
    setQuery(originalQuery);
    setOptions(originalOptions);
    setMode('view');
    setHasChanges(false);
  };

  const handleNewAnalysis = () => {
    const newId = 'analysis-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    navigate(`/query-analysis/${newId}`, { state: { isNew: true } });
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  const shareUrl = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast.success('Analysis URL copied to clipboard!');
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'critical': return <FiX className="h-5 w-5 text-red-600" />;
      case 'high': return <FiAlertTriangle className="h-5 w-5 text-orange-600" />;
      case 'medium': return <FiInfo className="h-5 w-5 text-yellow-600" />;
      default: return <FiInfo className="h-5 w-5 text-blue-600" />;
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const renderIssues = () => {
    if (!result?.issues || result.issues.length === 0) {
      return (
        <div className="text-center py-8">
          <FiCheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <p className="text-gray-600">No issues found! Your query looks good.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {result.issues.map((issue, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className={`p-4 rounded-lg border ${getSeverityColor(issue.severity)}`}
          >
            <div className="flex items-start gap-3">
              {getSeverityIcon(issue.severity)}
              <div className="flex-1">
                <h4 className="font-semibold mb-1">{issue.type}</h4>
                <p className="text-sm mb-2">{issue.description}</p>
                {issue.impact && (
                  <p className="text-xs opacity-75">Impact: {issue.impact}</p>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    );
  };

  const renderOptimizedQuery = () => {
    if (!result?.optimizedQuery) {
      return <p className="text-gray-500">No optimized query available</p>;
    }

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Optimized Query</h3>
          <button
            onClick={() => copyToClipboard(result.optimizedQuery)}
            className="btn-secondary btn-sm"
          >
            <FiCopy className="h-4 w-4 mr-1" />
            Copy
          </button>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono">
            {result.optimizedQuery}
          </pre>
        </div>
        {result.suggestions && result.suggestions.length > 0 && (
          <div className="mt-4">
            <h4 className="font-medium mb-2">Suggestions:</h4>
            <ul className="list-disc list-inside space-y-1">
              {result.suggestions.map((suggestion, index) => (
                <li key={index} className="text-sm text-gray-600">{suggestion}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderValidation = () => {
    if (!result?.validationResult) {
      return <p className="text-gray-500">Validation not performed</p>;
    }

    const validation = result.validationResult;
    
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <FiDollarSign className="h-5 w-5 text-green-600" />
              <h4 className="font-semibold text-green-900">Cost Savings</h4>
            </div>
            <p className="text-2xl font-bold text-green-700">{validation.costSavings}%</p>
            <p className="text-sm text-green-600 mt-1">
              ${validation.originalCost} → ${validation.optimizedCost}
            </p>
          </div>
          
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <FiDatabase className="h-5 w-5 text-blue-600" />
              <h4 className="font-semibold text-blue-900">Bytes Processed</h4>
            </div>
            <p className="text-lg font-bold text-blue-700">
              {Math.round((validation.bytesProcessedOptimized / validation.bytesProcessedOriginal) * 100)}% reduction
            </p>
            <p className="text-sm text-blue-600 mt-1">
              {(validation.bytesProcessedOriginal / 1e9).toFixed(2)}GB → {(validation.bytesProcessedOptimized / 1e9).toFixed(2)}GB
            </p>
          </div>
          
          <div className="bg-purple-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <FiSearch className="h-5 w-5 text-purple-600" />
              <h4 className="font-semibold text-purple-900">Rows Scanned</h4>
            </div>
            <p className="text-lg font-bold text-purple-700">
              {Math.round((validation.estimatedRowsOptimized / validation.estimatedRowsOriginal) * 100)}% reduction
            </p>
            <p className="text-sm text-purple-600 mt-1">
              {validation.estimatedRowsOriginal.toLocaleString()} → {validation.estimatedRowsOptimized.toLocaleString()}
            </p>
          </div>
        </div>
        
        {result.metadata && (
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-semibold mb-2">Optimization Metadata</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Optimization Time:</span>
                <span className="ml-2 font-medium">{result.metadata.optimizationTime}s</span>
              </div>
              <div>
                <span className="text-gray-600">Rules Applied:</span>
                <span className="ml-2 font-medium">{result.metadata.rulesApplied}</span>
              </div>
              <div>
                <span className="text-gray-600">Optimization Score:</span>
                <span className="ml-2 font-medium">{result.metadata.optimizationScore}/100</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <FiArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Query Analysis</h1>
            <p className="text-sm text-gray-600 mt-1">Analysis ID: {analysisId}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {mode === 'view' && result && (
            <>
              <button onClick={shareUrl} className="btn-secondary btn-sm">
                <FiShare2 className="h-4 w-4 mr-1" />
                Share
              </button>
              <button onClick={handleEditMode} className="btn-secondary btn-sm">
                <FiEdit3 className="h-4 w-4 mr-1" />
                Edit Query
              </button>
              <button onClick={handleNewAnalysis} className="btn-primary btn-sm">
                <FiPlus className="h-4 w-4 mr-1" />
                New Analysis
              </button>
            </>
          )}
        </div>
      </div>

      {/* Optimization Stages Display */}
      {showProgress && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card mb-4"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Optimization Stages</h3>
          <div className="space-y-2">
            {/* Stage 1: Metadata Extraction */}
            <div>
              <button
                onClick={() => stageData.metadata && setSelectedStage(selectedStage === 'metadata' ? null : 'metadata')}
                disabled={!stageData.metadata}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  stageData.metadata 
                    ? 'bg-green-50 hover:bg-green-100 cursor-pointer' 
                    : currentStep === 0 
                      ? 'bg-yellow-50 border-2 border-yellow-300 animate-pulse'
                      : 'bg-gray-50 cursor-not-allowed'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    {stageData.metadata ? (
                      <FiCheckCircle className="h-5 w-5 text-green-600" />
                    ) : currentStep === 0 ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-yellow-600 border-t-transparent" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                    )}
                    <span className={`font-medium ${!stageData.metadata && currentStep !== 0 ? 'text-gray-400' : ''}`}>
                      Metadata Extraction
                    </span>
                  </div>
                  <span className="text-sm text-gray-600">
                    {stageData.metadata 
                      ? `${stageData.metadata.tables_found} table(s), ${stageData.metadata.total_size_gb}GB`
                      : currentStep === 0 
                        ? 'Processing...'
                        : 'Waiting...'}
                  </span>
                </div>
              </button>
              {selectedStage === 'metadata' && stageData.metadata && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="ml-7 mt-2 p-3 bg-white rounded-lg border border-blue-200"
                >
                  <pre className="text-xs text-gray-700 overflow-auto">
                    {JSON.stringify(stageData.metadata, null, 2)}
                  </pre>
                </motion.div>
              )}
            </div>

            {/* Stage 2: Rule Analysis */}
            <div>
              <button
                onClick={() => stageData.rules && setSelectedStage(selectedStage === 'rules' ? null : 'rules')}
                disabled={!stageData.rules}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  stageData.rules 
                    ? 'bg-green-50 hover:bg-green-100 cursor-pointer' 
                    : currentStep === 1 
                      ? 'bg-yellow-50 border-2 border-yellow-300 animate-pulse'
                      : 'bg-gray-50 cursor-not-allowed'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    {stageData.rules ? (
                      <FiCheckCircle className="h-5 w-5 text-green-600" />
                    ) : currentStep === 1 ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-yellow-600 border-t-transparent" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                    )}
                    <span className={`font-medium ${!stageData.rules && currentStep !== 1 ? 'text-gray-400' : ''}`}>
                      Anti-Pattern Analysis
                    </span>
                  </div>
                  <span className="text-sm text-gray-600">
                    {stageData.rules 
                      ? `${stageData.rules.violations_found} violations, ${stageData.rules.compliance_score}% compliant`
                      : currentStep === 1 
                        ? 'Processing...'
                        : 'Waiting...'}
                  </span>
                </div>
              </button>
              {selectedStage === 'rules' && stageData.rules && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="ml-7 mt-2 p-3 bg-white rounded-lg border border-green-200"
                >
                  <pre className="text-xs text-gray-700 overflow-auto">
                    {JSON.stringify(stageData.rules, null, 2)}
                  </pre>
                </motion.div>
              )}
            </div>

            {/* Stage 3: Query Optimization */}
            <div>
              <button
                onClick={() => stageData.optimization && setSelectedStage(selectedStage === 'optimization' ? null : 'optimization')}
                disabled={!stageData.optimization}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  stageData.optimization 
                    ? 'bg-green-50 hover:bg-green-100 cursor-pointer' 
                    : currentStep === 2 
                      ? 'bg-yellow-50 border-2 border-yellow-300 animate-pulse'
                      : 'bg-gray-50 cursor-not-allowed'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    {stageData.optimization ? (
                      <FiCheckCircle className="h-5 w-5 text-green-600" />
                    ) : currentStep === 2 ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-yellow-600 border-t-transparent" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                    )}
                    <span className={`font-medium ${!stageData.optimization && currentStep !== 2 ? 'text-gray-400' : ''}`}>
                      Query Optimization
                    </span>
                  </div>
                  <span className="text-sm text-gray-600">
                    {stageData.optimization 
                      ? `${stageData.optimization.total_optimizations} steps, ${stageData.optimization.total_improvement}`
                      : currentStep === 2 
                        ? 'Processing...'
                        : 'Waiting...'}
                  </span>
                </div>
              </button>
              {selectedStage === 'optimization' && stageData.optimization && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="ml-7 mt-2 p-3 bg-white rounded-lg border border-green-200"
                >
                  <pre className="text-xs text-gray-700 overflow-auto">
                    {JSON.stringify(stageData.optimization, null, 2)}
                  </pre>
                </motion.div>
              )}
            </div>

            {/* Stage 4: Final Report */}
            <div>
              <button
                onClick={() => stageData.report && setSelectedStage(selectedStage === 'report' ? null : 'report')}
                disabled={!stageData.report}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  stageData.report 
                    ? 'bg-green-50 hover:bg-green-100 cursor-pointer' 
                    : currentStep === 3 
                      ? 'bg-yellow-50 border-2 border-yellow-300 animate-pulse'
                      : 'bg-gray-50 cursor-not-allowed'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    {stageData.report ? (
                      <FiCheckCircle className="h-5 w-5 text-green-600" />
                    ) : currentStep === 3 ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-yellow-600 border-t-transparent" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                    )}
                    <span className={`font-medium ${!stageData.report && currentStep !== 3 ? 'text-gray-400' : ''}`}>
                      Final Report
                    </span>
                  </div>
                  <span className="text-sm text-gray-600">
                    {stageData.report 
                      ? `${stageData.report.executive_summary?.cost_reduction} cost reduction`
                      : currentStep === 3 
                        ? 'Processing...'
                        : 'Waiting...'}
                  </span>
                </div>
              </button>
              {selectedStage === 'report' && stageData.report && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="ml-7 mt-2 p-3 bg-white rounded-lg border border-green-200"
                >
                  <pre className="text-xs text-gray-700 overflow-auto">
                    {JSON.stringify(stageData.report, null, 2)}
                  </pre>
                </motion.div>
              )}
            </div>

            {/* Stage 5: Query Validation (if enabled) */}
            {options.validate && (
              <div>
                <button
                  onClick={() => stageData.validation && setSelectedStage(selectedStage === 'validation' ? null : 'validation')}
                  disabled={!stageData.validation}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    stageData.validation 
                      ? 'bg-green-50 hover:bg-green-100 cursor-pointer' 
                      : currentStep === 4 
                        ? 'bg-yellow-50 border-2 border-yellow-300 animate-pulse'
                        : 'bg-gray-50 cursor-not-allowed'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      {stageData.validation ? (
                        <FiCheckCircle className="h-5 w-5 text-green-600" />
                      ) : currentStep === 4 ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-yellow-600 border-t-transparent" />
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                      )}
                      <span className={`font-medium ${!stageData.validation && currentStep !== 4 ? 'text-gray-400' : ''}`}>
                        Query Validation
                      </span>
                    </div>
                    <span className="text-sm text-gray-600">
                      {stageData.validation 
                        ? 'Validation complete'
                        : currentStep === 4 
                          ? 'Validating...'
                          : 'Waiting...'}
                    </span>
                  </div>
                </button>
                {selectedStage === 'validation' && stageData.validation && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="ml-7 mt-2 p-3 bg-white rounded-lg border border-green-200"
                  >
                    <pre className="text-xs text-gray-700 overflow-auto">
                      {JSON.stringify(stageData.validation, null, 2)}
                    </pre>
                  </motion.div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Edit Mode */}
      {mode === 'edit' && (
        <div className="card space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Enter your BigQuery SQL
            </label>
            <div className="border rounded-lg overflow-hidden">
              <MonacoEditor
                height="300px"
                defaultLanguage="sql"
                value={query}
                onChange={setQuery}
                theme="vs-light"
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={options.rewrite}
                onChange={(e) => setOptions({ ...options, rewrite: e.target.checked })}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">Rewrite query</span>
            </label>
            
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={options.validate}
                onChange={(e) => setOptions({ ...options, validate: e.target.checked })}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">Validate optimization</span>
            </label>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleAnalyze}
              disabled={loading || !query.trim()}
              className="btn-primary"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Analyzing...
                </>
              ) : (
                <>
                  <FiPlay className="h-4 w-4 mr-1" />
                  Analyze Query
                </>
              )}
            </button>
            {!isNew && originalQuery && (
              <button onClick={handleCancelEdit} className="btn-secondary">
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* View Mode - Results or Error */}
      {mode === 'view' && result && (
        <>
          {/* Original Query Display */}
          {!result.error && (
            <div className="card mb-4">
              <div className="flex justify-between items-start mb-3">
                <h3 className="text-lg font-semibold text-gray-900">Original Query</h3>
                <button
                  onClick={() => copyToClipboard(result.originalQuery || query)}
                  className="btn-secondary btn-sm"
                >
                  <FiCopy className="h-4 w-4 mr-1" />
                  Copy
                </button>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono">
                  {result.originalQuery || query}
                </pre>
              </div>
            </div>
          )}

          {/* Stage Data Display */}
          {!result.error && Object.keys(stageData).some(key => stageData[key]) && (
            <div className="card mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Optimization Stages</h3>
              <div className="space-y-2">
                {stageData.metadata && (
                  <button
                    onClick={() => setSelectedStage(selectedStage === 'metadata' ? null : 'metadata')}
                    className="w-full text-left p-3 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors"
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <FiDatabase className="h-5 w-5 text-blue-600" />
                        <span className="font-medium">Metadata Extraction</span>
                      </div>
                      <span className="text-sm text-gray-600">
                        {stageData.metadata.tables_found} table(s), {stageData.metadata.total_size_gb}GB
                      </span>
                    </div>
                  </button>
                )}
                {selectedStage === 'metadata' && stageData.metadata && (
                  <div className="ml-7 p-3 bg-white rounded-lg border border-blue-200">
                    <pre className="text-xs text-gray-700 overflow-auto">
                      {JSON.stringify(stageData.metadata, null, 2)}
                    </pre>
                  </div>
                )}

                {stageData.rules && (
                  <button
                    onClick={() => setSelectedStage(selectedStage === 'rules' ? null : 'rules')}
                    className="w-full text-left p-3 rounded-lg bg-yellow-50 hover:bg-yellow-100 transition-colors"
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <FiAlertTriangle className="h-5 w-5 text-yellow-600" />
                        <span className="font-medium">Rule Analysis</span>
                      </div>
                      <span className="text-sm text-gray-600">
                        {stageData.rules.violations_found} violations, {stageData.rules.compliance_score}% compliant
                      </span>
                    </div>
                  </button>
                )}
                {selectedStage === 'rules' && stageData.rules && (
                  <div className="ml-7 p-3 bg-white rounded-lg border border-yellow-200">
                    <pre className="text-xs text-gray-700 overflow-auto">
                      {JSON.stringify(stageData.rules, null, 2)}
                    </pre>
                  </div>
                )}

                {stageData.optimization && (
                  <button
                    onClick={() => setSelectedStage(selectedStage === 'optimization' ? null : 'optimization')}
                    className="w-full text-left p-3 rounded-lg bg-green-50 hover:bg-green-100 transition-colors"
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <FiCheckCircle className="h-5 w-5 text-green-600" />
                        <span className="font-medium">Query Optimization</span>
                      </div>
                      <span className="text-sm text-gray-600">
                        {stageData.optimization.total_optimizations} steps, {stageData.optimization.total_improvement}
                      </span>
                    </div>
                  </button>
                )}
                {selectedStage === 'optimization' && stageData.optimization && (
                  <div className="ml-7 p-3 bg-white rounded-lg border border-green-200">
                    <pre className="text-xs text-gray-700 overflow-auto">
                      {JSON.stringify(stageData.optimization, null, 2)}
                    </pre>
                  </div>
                )}

                {stageData.report && (
                  <button
                    onClick={() => setSelectedStage(selectedStage === 'report' ? null : 'report')}
                    className="w-full text-left p-3 rounded-lg bg-purple-50 hover:bg-purple-100 transition-colors"
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <FiInfo className="h-5 w-5 text-purple-600" />
                        <span className="font-medium">Final Report</span>
                      </div>
                      <span className="text-sm text-gray-600">
                        {stageData.report.executive_summary?.cost_reduction} cost reduction
                      </span>
                    </div>
                  </button>
                )}
                {selectedStage === 'report' && stageData.report && (
                  <div className="ml-7 p-3 bg-white rounded-lg border border-purple-200">
                    <pre className="text-xs text-gray-700 overflow-auto">
                      {JSON.stringify(stageData.report, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error Display */}
          {result.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <FiAlertTriangle className="h-6 w-6 text-red-600 mt-1" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-red-900 mb-2">
                    Optimization Service Unavailable
                  </h3>
                  <p className="text-red-700 mb-4">{result.message}</p>
                  
                  {result.suggestions && result.suggestions.length > 0 && (
                    <div className="bg-white rounded-lg p-4 border border-red-100">
                      <h4 className="text-sm font-semibold text-gray-900 mb-2">
                        How to fix this:
                      </h4>
                      <ul className="space-y-2">
                        {result.suggestions.map((suggestion, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <span className="text-red-500 mt-1">•</span>
                            <span className="text-sm text-gray-700">{suggestion}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {result.details && (
                    <details className="mt-4">
                      <summary className="text-sm text-gray-600 cursor-pointer hover:text-gray-800">
                        View technical details
                      </summary>
                      <pre className="mt-2 text-xs bg-white p-3 rounded border border-red-100 overflow-auto">
                        {JSON.stringify(result.details, null, 2)}
                      </pre>
                    </details>
                  )}
                  
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => window.location.reload()}
                      className="btn-secondary btn-sm"
                    >
                      Refresh Page
                    </button>
                    <button
                      onClick={() => navigate('/dashboard')}
                      className="btn-secondary btn-sm"
                    >
                      Back to Dashboard
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Only show results UI when there's no error */}
          {!result.error && (
            <>
              {/* Optimization Output Heading */}
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Optimization Output</h2>
                <p className="text-sm text-gray-600 mt-1">Analysis completed with {result?.issues?.length || 0} issues found</p>
              </div>
              
              {hasChanges && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FiAlertTriangle className="h-5 w-5 text-yellow-600" />
                      <p className="text-sm text-yellow-800">You have unsaved changes to this query.</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleAnalyze} className="btn-primary btn-sm">
                        Re-analyze
                      </button>
                      <button onClick={handleCancelEdit} className="btn-secondary btn-sm">
                        Discard Changes
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="card">
                <div className="border-b border-gray-200">
                  <nav className="-mb-px flex space-x-8">
                    {['issues', 'optimized', 'validation'].map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`py-3 px-1 border-b-2 font-medium text-sm capitalize ${
                          activeTab === tab
                            ? 'border-primary-500 text-primary-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        {tab === 'issues' && `Issues (${result?.issues?.length || 0})`}
                        {tab === 'optimized' && 'Optimized Query'}
                        {tab === 'validation' && 'Validation'}
                      </button>
                    ))}
                  </nav>
                </div>
                
                <div className="pt-6">
                  {activeTab === 'issues' && renderIssues()}
                  {activeTab === 'optimized' && renderOptimizedQuery()}
                  {activeTab === 'validation' && renderValidation()}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default AnalysisResult;