import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import MonacoEditor from '@monaco-editor/react';
import { FiArrowLeft, FiCheck, FiX, FiAlertTriangle, FiInfo, FiDollarSign, FiCopy, FiShare2, FiPlay, FiDatabase, FiSearch, FiEdit3, FiCheckCircle, FiPlus, FiTrendingDown, FiZap, FiActivity } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { analyses } from '../services/database';
import { mockOptimizationService, createProgressTracker } from '../services/mockData';
import { optimizeQueryWithADK, testADKConnection } from '../services/adk';

const AnalysisResult = () => {
  const { analysisId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isNew = location.pathname.includes('/new');

  // Core state
  const [mode, setMode] = useState(isNew ? 'edit' : 'loading');
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState({
    rewrite: true,
    validate: false,
    projectName: 'Default Project'
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('issues');
  const [hasChanges, setHasChanges] = useState(false);
  const [originalQuery, setOriginalQuery] = useState('');
  const [originalOptions, setOriginalOptions] = useState(null);
  
  // Progress tracking
  const [showProgress, setShowProgress] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [stageData, setStageData] = useState({});
  const [selectedStage, setSelectedStage] = useState(null);
  const [analysisStatus, setAnalysisStatus] = useState('idle');
  const [backendStatus, setBackendStatus] = useState(null);

  // Load existing analysis
  useEffect(() => {
    if (!isNew && analysisId) {
      loadExistingAnalysis();
    }
  }, [analysisId, isNew]);

  const loadExistingAnalysis = async () => {
    try {
      // First check for completed analysis results in localStorage
      const savedResult = localStorage.getItem(`analysis-result-${analysisId}`);
      if (savedResult) {
        const analysisData = JSON.parse(savedResult);
        
        setQuery(analysisData.query || '');
        setOptions(analysisData.options || {
          projectId: '',
          datasetId: '',
          validate: true,
          projectName: 'Default Project'
        });
        setResult(analysisData.result);
        
        // Load stage data
        if (analysisData.stageData) {
          setStageData(analysisData.stageData);
        }
        
        setOriginalQuery(analysisData.query);
        setOriginalOptions(analysisData.options);
        setMode('view');
        setAnalysisStatus('completed');
        return;
      }
      
      // Otherwise check database
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

  const handleAnalyze = async () => {
    if (!query.trim()) {
      toast.error('Please enter a SQL query');
      return;
    }

    setLoading(true);
    setShowProgress(true);
    setCurrentStep(0);
    setAnalysisStatus('analyzing');
    setStageData({});
    setBackendStatus(null);

    try {
      // Test ADK connection first
      const adkAvailable = await testADKConnection();
      let optimizationResult = null;
      
      if (adkAvailable) {
        console.log('Using ADK backend for optimization');
        
        try {
          optimizationResult = await optimizeQueryWithADK(query, {
            ...options,
            onProgress: (event) => {
              if (event.stage === 'metadata') {
                setCurrentStep(0);
              } else if (event.stage === 'analysis') {
                setCurrentStep(1);
              } else if (event.stage === 'optimization') {
                setCurrentStep(2);
              } else if (event.stage === 'finalizing') {
                setCurrentStep(3);
              }
              
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
        // Fall back to mock service
        setBackendStatus({
          service: 'mock',
          message: 'Using mock service (ADK not available)'
        });
        
        const tracker = createProgressTracker();
        const progressInterval = setInterval(() => {
          const update = tracker.getNextUpdate();
          if (update) {
            setCurrentStep(update.step === 'parsing' ? 0 : 
                         update.step === 'analyzing' ? 1 : 
                         update.step === 'optimizing' ? 2 : 
                         update.step === 'validating' ? 3 : 4);
          }
        }, 500);

        optimizationResult = await mockOptimizationService.optimizeQuery(query, options);
        clearInterval(progressInterval);
      }
      
      // Check if we have a valid optimization result
      if (!optimizationResult) {
        throw new Error('No optimization result received');
      }
      
      // Merge stage data with the final result
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
      
      // Save the complete analysis result for this ID
      const analysisData = {
        id: analysisId,
        query: query,
        options: options,
        result: finalResult,
        stageData: stageData,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem(`analysis-result-${analysisId}`, JSON.stringify(analysisData));
      
      // Clear the temporary analysis data
      localStorage.removeItem(`analysis-${analysisId}`);
      
      toast.success('Query analyzed successfully!');
      
      // Keep showing progress to display all completed stages
      // Don't hide it immediately - let user see the completed stages
      setCurrentStep(-1); // Reset current step but keep showProgress true
      
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
  };

  const handleCancelEdit = () => {
    setQuery(originalQuery);
    setOptions(originalOptions);
    setMode('view');
    setHasChanges(false);
  };

  const handleNewAnalysis = () => {
    const newId = `analysis-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    navigate(`/analysis/${newId}/new`);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  const shareUrl = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast.success('Share URL copied to clipboard!');
  };

  const renderOptimizationImpact = () => {
    if (!result.metadata?.stages?.report) return null;
    
    const report = result.metadata.stages.report;
    const summary = report.executive_summary;
    
    return (
      <div className="card mb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Optimization Impact</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <div className="flex items-center gap-2 mb-2">
              <FiTrendingDown className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-gray-700">Cost Reduction</span>
            </div>
            <div className="text-2xl font-bold text-green-700">{summary?.cost_reduction || 'N/A'}</div>
            {report.optimization_summary && (
              <div className="text-xs text-gray-600 mt-1">
                {report.optimization_summary.estimated_cost_before} → {report.optimization_summary.estimated_cost_after}
              </div>
            )}
          </div>
          
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="flex items-center gap-2 mb-2">
              <FiZap className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">Performance Gain</span>
            </div>
            <div className="text-2xl font-bold text-blue-700">{summary?.performance_gain || 'N/A'}</div>
            <div className="text-xs text-gray-600 mt-1">Query execution time</div>
          </div>
          
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <div className="flex items-center gap-2 mb-2">
              <FiDatabase className="h-5 w-5 text-purple-600" />
              <span className="text-sm font-medium text-gray-700">Data Reduction</span>
            </div>
            <div className="text-2xl font-bold text-purple-700">{summary?.data_reduction || 'N/A'}</div>
            <div className="text-xs text-gray-600 mt-1">Less data scanned</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="p-2 hover:bg-gray-100 rounded-lg">
            <FiArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            {isNew ? 'New Analysis' : mode === 'edit' ? 'Edit Analysis' : 'Analysis Results'}
          </h1>
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

      {/* Edit Mode - Show input first during analysis */}
      {mode === 'edit' && (
        <div className="card space-y-4 mb-4">
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
                  wordWrap: 'on',
                  formatOnPaste: true,
                  formatOnType: true,
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

      {/* Original Query Display - Show in view mode with better formatting */}
      {mode === 'view' && originalQuery && (
        <div className="card mb-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold text-gray-900">Original Query</h3>
            <button
              onClick={() => copyToClipboard(originalQuery)}
              className="btn-secondary btn-sm"
              title="Copy to clipboard"
            >
              <FiCopy className="h-4 w-4" />
            </button>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <MonacoEditor
              height="200px"
              defaultLanguage="sql"
              value={originalQuery}
              theme="vs-light"
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                wordWrap: 'on',
                renderWhitespace: 'none',
                folding: false,
                lineDecorationsWidth: 0,
                lineNumbersMinChars: 3,
              }}
            />
          </div>
        </div>
      )}

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
                  <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto">
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
                  className="ml-7 mt-2 p-3 bg-white rounded-lg border border-yellow-200"
                >
                  <div className="space-y-2">
                    {stageData.rules.violations && stageData.rules.violations.map((violation, idx) => (
                      <div key={idx} className="text-xs">
                        <span className="font-medium">{violation.rule_id}:</span> {violation.fix}
                      </div>
                    ))}
                  </div>
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
                  <div className="space-y-2">
                    {stageData.optimization.steps && stageData.optimization.steps.map((step, idx) => (
                      <div key={idx} className="text-xs">
                        <span className="font-medium">Step {step.step}:</span> {step.optimization} - {step.improvement}
                      </div>
                    ))}
                  </div>
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
                  className="ml-7 mt-2 p-3 bg-white rounded-lg border border-purple-200"
                >
                  <div className="text-xs space-y-1">
                    <div><span className="font-medium">Cost:</span> {stageData.report.optimization_summary?.estimated_cost_before} → {stageData.report.optimization_summary?.estimated_cost_after}</div>
                    <div><span className="font-medium">Performance:</span> {stageData.report.executive_summary?.performance_gain}</div>
                    <div><span className="font-medium">Data Saved:</span> {stageData.report.executive_summary?.data_reduction}</div>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Issues Found - Show after stages */}
      {mode === 'view' && result && !result.error && result.issues && result.issues.length > 0 && (
        <div className="card mb-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Issues Found</h3>
          <div className="space-y-2">
            {result.issues.map((issue, idx) => (
              <div key={idx} className="border-l-4 border-yellow-400 bg-yellow-50 p-3 rounded">
                <div className="flex items-start gap-2">
                  <FiAlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium text-sm text-gray-900">{issue.type || issue.rule_id}</div>
                    <div className="text-sm text-gray-600 mt-1">{issue.description || issue.fix}</div>
                    {issue.impact && (
                      <div className="text-xs text-gray-500 mt-1">Impact: {issue.impact}</div>
                    )}
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded ${
                    issue.severity === 'critical' ? 'bg-red-100 text-red-700' :
                    issue.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                    issue.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {issue.severity || 'info'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Optimization Impact */}
      {mode === 'view' && result && !result.error && renderOptimizationImpact()}

      {/* Optimized Query Output */}
      {mode === 'view' && result && result.optimizedQuery && !result.error && (
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Optimized Query</h3>
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <pre className="text-sm text-gray-700 overflow-x-auto">
              <code>{result.optimizedQuery}</code>
            </pre>
          </div>
          
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => {
                navigator.clipboard.writeText(result.optimizedQuery);
                toast.success('Optimized query copied to clipboard!');
              }}
              className="btn-secondary btn-sm"
            >
              <FiCopy className="h-4 w-4 mr-1" />
              Copy Optimized Query
            </button>
          </div>
        </div>
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

      {/* Error State */}
      {mode === 'view' && result && result.error && (
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalysisResult;