import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import MonacoEditor from '@monaco-editor/react';
import { FiArrowLeft, FiCheck, FiX, FiAlertTriangle, FiInfo, FiDollarSign, FiCopy, FiShare2, FiPlay, FiDatabase, FiSearch, FiEdit3, FiCheckCircle, FiXCircle, FiPlus, FiTrendingDown, FiZap, FiActivity, FiLayout, FiCode } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { mockOptimizationService, createProgressTracker } from '../services/mockData';
import { optimizeQueryWithADK, testADKConnection } from '../services/adk';
import { saveAnalysisToFirestore, getAnalysisFromFirestore, isFirestoreAvailable } from '../services/analysisService';
// Removed query validation service - validation now handled by agent workflow

// Utility functions
const formatCost = (cost) => {
  if (!cost || cost === 0) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
};

const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
};

const formatGBSize = (sizeInGB) => {
  if (!sizeInGB || sizeInGB === 0) return '0 B';
  
  // Convert GB to bytes first
  const bytes = sizeInGB * 1024 * 1024 * 1024;
  
  // Determine the appropriate unit
  if (sizeInGB >= 1024) {
    // TB or PB
    if (sizeInGB >= 1024 * 1024) {
      return `${(sizeInGB / (1024 * 1024)).toFixed(2)} PB`;
    }
    return `${(sizeInGB / 1024).toFixed(2)} TB`;
  } else if (sizeInGB >= 1) {
    return `${sizeInGB.toFixed(2)} GB`;
  } else if (sizeInGB >= 0.001) {
    return `${(sizeInGB * 1024).toFixed(2)} MB`;
  } else {
    return `${(sizeInGB * 1024 * 1024).toFixed(2)} KB`;
  }
};

// BigQuery-style SQL Formatter
const formatSQL = (sql) => {
  if (!sql) return '';
  
  // Remove extra whitespace and normalize
  let formatted = sql.replace(/\s+/g, ' ').trim();
  
  // Replace backticks if needed (BigQuery uses backticks)
  formatted = formatted.replace(/"/g, '`');
  
  // Handle SELECT with column list
  formatted = formatted.replace(/\bSELECT\s+(.*?)\s+FROM\b/gi, (match, columns) => {
    // If it's SELECT *, keep it simple
    if (columns.trim() === '*') {
      return 'SELECT\n  *\nFROM';
    }
    
    // Split columns and format them
    const columnList = columns.split(',').map(col => col.trim());
    const formattedColumns = columnList.map((col, idx) => {
      if (idx === 0) {
        return `  ${col}`;
      }
      return `  ${col}`;
    }).join(',\n');
    
    return `SELECT\n${formattedColumns}\nFROM`;
  });
  
  // Handle FROM clause with proper spacing
  formatted = formatted.replace(/\bFROM\s+/gi, 'FROM\n  ');
  
  // Handle JOIN clauses - BigQuery style
  formatted = formatted.replace(/\b(LEFT|RIGHT|INNER|FULL|CROSS)?\s*(JOIN)\b/gi, (match) => {
    return '\n' + match.toUpperCase();
  });
  
  // Handle ON clause for JOINs
  formatted = formatted.replace(/\bON\b/gi, '\n  ON');
  
  // Handle WHERE clause
  formatted = formatted.replace(/\bWHERE\b/gi, '\nWHERE');
  
  // Handle AND/OR in WHERE clause - indent them
  formatted = formatted.replace(/\b(AND|OR)\b/gi, (match) => {
    return '\n  ' + match.toUpperCase();
  });
  
  // Handle GROUP BY
  formatted = formatted.replace(/\bGROUP\s+BY\b/gi, '\nGROUP BY');
  
  // Handle ORDER BY
  formatted = formatted.replace(/\bORDER\s+BY\b/gi, '\nORDER BY');
  
  // Handle HAVING
  formatted = formatted.replace(/\bHAVING\b/gi, '\nHAVING');
  
  // Handle LIMIT
  formatted = formatted.replace(/\bLIMIT\b/gi, '\nLIMIT');
  
  // Handle OFFSET
  formatted = formatted.replace(/\bOFFSET\b/gi, '\nOFFSET');
  
  // Handle WITH clause (CTEs)
  formatted = formatted.replace(/\bWITH\b/gi, 'WITH');
  formatted = formatted.replace(/\bAS\s*\(/gi, ' AS (');
  
  // Handle UNION
  formatted = formatted.replace(/\bUNION(\s+ALL)?\b/gi, (match) => {
    return '\n' + match.toUpperCase();
  });
  
  // Handle CASE statements
  formatted = formatted.replace(/\bCASE\b/gi, '\n    CASE');
  formatted = formatted.replace(/\bWHEN\b/gi, '\n      WHEN');
  formatted = formatted.replace(/\bTHEN\b/gi, ' THEN');
  formatted = formatted.replace(/\bELSE\b/gi, '\n      ELSE');
  formatted = formatted.replace(/\bEND\b/gi, '\n    END');
  
  // Handle subqueries - add newline after opening parenthesis
  formatted = formatted.replace(/\(\s*SELECT/gi, '(\n  SELECT');
  
  // Clean up multiple newlines
  formatted = formatted.replace(/\n\s*\n/g, '\n');
  
  // Fix indentation for specific patterns
  const lines = formatted.split('\n');
  let inSubquery = 0;
  const finalLines = lines.map((line) => {
    const trimmed = line.trim();
    
    // Track subquery depth
    const openParens = (line.match(/\(/g) || []).length;
    const closeParens = (line.match(/\)/g) || []).length;
    inSubquery += openParens - closeParens;
    
    // Apply consistent indentation based on context
    if (inSubquery > 0 && !trimmed.startsWith('SELECT')) {
      return '    ' + trimmed;
    }
    
    // Already indented lines
    if (line.startsWith('  ')) {
      return line;
    }
    
    // Main clauses
    if (trimmed.match(/^(SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|WITH|UNION)/)) {
      return trimmed;
    }
    
    // JOIN clauses
    if (trimmed.match(/^(LEFT|RIGHT|INNER|FULL|CROSS)?\s*JOIN/i)) {
      return trimmed;
    }
    
    // ON clauses for JOINs
    if (trimmed.startsWith('ON')) {
      return '  ' + trimmed;
    }
    
    // AND/OR in WHERE
    if (trimmed.match(/^(AND|OR)/i)) {
      return '  ' + trimmed;
    }
    
    return line;
  });
  
  return finalLines.join('\n').trim();
};

const AnalysisResult = () => {
  const { analysisId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isNew = location.pathname.includes('/new');
  const agenticWorkflowRef = useRef(null);

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
  
  // UI state for stage views
  const [metadataView, setMetadataView] = useState('rendered');
  const [rulesView, setRulesView] = useState('rendered');
  const [optimizationView, setOptimizationView] = useState('rendered');
  const [reportView, setReportView] = useState('rendered');
  const [copied, setCopied] = useState(false);
  const [copiedStage, setCopiedStage] = useState(null);
  
  // Validation error state
  const [validationError, setValidationError] = useState(null);

  // Helper to get stage data from either stageData or result.metadata.stages
  const getStageData = (stageName) => {
    // Check stageData first
    if (stageData && stageData[stageName]) {
      return stageData[stageName];
    }
    
    // Check result.metadata.stages
    if (result?.metadata?.stages?.[stageName]) {
      return result.metadata.stages[stageName];
    }
    
    // For final report, also check if it exists directly in result
    if (stageName === 'report' && result?.metadata?.final_report) {
      return result.metadata.final_report;
    }
    
    return null;
  };

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
        
        // Load stage data - check both stageData and result.metadata.stages
        if (analysisData.stageData) {
          console.log('Loading stageData from saved analysis:', analysisData.stageData);
          setStageData(analysisData.stageData);
        } else if (analysisData.result?.metadata?.stages) {
          console.log('Loading stageData from result.metadata.stages:', analysisData.result.metadata.stages);
          setStageData(analysisData.result.metadata.stages);
        } else {
          console.log('No stage data found in saved analysis');
        }
        
        setOriginalQuery(analysisData.query);
        setOriginalOptions(analysisData.options);
        setMode('view');
        setAnalysisStatus('completed');
        // Reset currentStep when loading completed analysis
        setCurrentStep(-1);
        setShowProgress(false);
        return;
      }
      
      // Check Firestore if available
      try {
        const firestoreAvailable = await isFirestoreAvailable();
        if (firestoreAvailable) {
          const firestoreAnalysis = await getAnalysisFromFirestore(analysisId);
          if (firestoreAnalysis) {
            console.log('Loaded analysis from Firestore:', firestoreAnalysis);
            
            setQuery(firestoreAnalysis.query || '');
            setOptions(firestoreAnalysis.options || {
              projectId: '',
              datasetId: '',
              validate: true,
              projectName: 'Default Project'
            });
            setResult(firestoreAnalysis.result);
            
            // Load stage data
            if (firestoreAnalysis.stage_data) {
              setStageData(firestoreAnalysis.stage_data);
            } else if (firestoreAnalysis.result?.metadata?.stages) {
              setStageData(firestoreAnalysis.result.metadata.stages);
            }
            
            setOriginalQuery(firestoreAnalysis.query);
            setOriginalOptions(firestoreAnalysis.options);
            setMode('view');
            setAnalysisStatus('completed');
            setCurrentStep(-1);
            setShowProgress(false);
            
            // Also save to localStorage for quick access
            localStorage.setItem(`analysis-result-${analysisId}`, JSON.stringify({
              id: analysisId,
              query: firestoreAnalysis.query,
              options: firestoreAnalysis.options,
              result: firestoreAnalysis.result,
              stageData: firestoreAnalysis.stage_data,
              timestamp: firestoreAnalysis.created_at || firestoreAnalysis.timestamp
            }));
            
            return;
          }
        }
      } catch (firestoreError) {
        console.error('Error loading from Firestore:', firestoreError);
        // Continue with localStorage data if available
      }
      
      // If not found in Firestore or localStorage, start in edit mode
      setMode('edit');
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

    // Clear any previous validation errors
    setValidationError(null);
    
    setLoading(true);
    setShowProgress(true); // Show progress immediately
    setCurrentStep(0);
    setAnalysisStatus('analyzing'); // Skip validation status
    setStageData({});
    setBackendStatus(null);
    
    // Skip dry run validation - the agent workflow will handle validation
    
    setAnalysisStatus('analyzing');
    
    // Scroll to Agentic Workflow Stages section
    setTimeout(() => {
      if (agenticWorkflowRef.current) {
        agenticWorkflowRef.current.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start'
        });
      }
    }, 100);

    let optimizationResult = null; // Declare at the beginning of try block

    try {
      // Test ADK connection first
      const adkAvailable = await testADKConnection();
      
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
        
        // Create a simple progress simulation for mock service
        let mockStep = 0;
        const progressInterval = setInterval(() => {
          if (mockStep < 4) {
            setCurrentStep(mockStep);
            mockStep++;
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
      
      // Save to Firestore if available
      try {
        const firestoreAvailable = await isFirestoreAvailable();
        if (firestoreAvailable) {
          const firestoreResult = await saveAnalysisToFirestore({
            ...analysisData,
            projectId: options.projectId || 'default'
          });
          if (firestoreResult && firestoreResult.analysis_id) {
            console.log('Analysis saved to Firestore with ID:', firestoreResult.analysis_id);
          }
        }
      } catch (firestoreError) {
        console.error('Failed to save to Firestore:', firestoreError);
        toast.warning('Analysis saved locally only - cloud storage unavailable');
      }
      
      // Clear the temporary analysis data
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
  };

  const handleCancelEdit = () => {
    setQuery(originalQuery);
    setOptions(originalOptions);
    setMode('view');
    setHasChanges(false);
  };

  const handleNewAnalysis = () => {
    const newId = `analysis-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    // Clear local storage for clean new analysis
    localStorage.removeItem(`analysis-${analysisId}`);
    // Navigate to new analysis with forced reload
    window.location.href = `/analysis/${newId}/new`;
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  const shareUrl = async () => {
    // Ensure the current analysis is saved before sharing
    if (result && !result.error) {
      const analysisData = {
        id: analysisId,
        query: query,
        options: options,
        result: result,
        stageData: stageData,
        timestamp: new Date().toISOString()
      };
      
      // Save to localStorage to ensure it's available when link is accessed
      localStorage.setItem(`analysis-result-${analysisId}`, JSON.stringify(analysisData));
      
      // Also try to save to database for persistence
      try {
        const existing = await analyses.getByAnalysisId(analysisId);
        if (!existing) {
          await analyses.create({
            analysisId: analysisId,
            query: query,
            originalQuery: query,
            optimizedQuery: result.optimizedQuery,
            issues: result.issues,
            validationResult: result.validationResult,
            metadata: result.metadata,
            options: options,
            stageData: stageData
          });
        }
      } catch (dbError) {
        console.error('Failed to save to database:', dbError);
      }
    }
    
    const url = window.location.href.replace('/new', '');
    navigator.clipboard.writeText(url);
    toast.success('Share URL copied to clipboard!');
  };

  const renderOptimizationImpact = () => {
    const report = getStageData('report');
    if (!report) return null;
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
          <button onClick={() => navigate('/query-analysis')} className="p-2 hover:bg-gray-100 rounded-lg">
            <FiArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            {isNew ? 'New Analysis' : `Analysis: ${analysisId.substring(0, 20)}...`}
          </h1>
        </div>
        
        <div className="flex items-center gap-2">
          {mode === 'view' && result && (
            <>
              <button onClick={shareUrl} className="btn-secondary px-3 py-1.5 text-sm flex items-center gap-1.5">
                <FiShare2 className="h-4 w-4" />
                <span>Share</span>
              </button>
              <button onClick={handleEditMode} className="btn-secondary px-3 py-1.5 text-sm flex items-center gap-1.5">
                <FiEdit3 className="h-4 w-4" />
                <span>Edit Query</span>
              </button>
              <button onClick={handleNewAnalysis} className="btn-primary px-3 py-1.5 text-sm flex items-center gap-1.5">
                <FiPlus className="h-4 w-4" />
                <span>New Analysis</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Edit Mode - Show first during analysis */}
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
                onChange={(value) => {
                  setQuery(value);
                  // Clear validation error when user modifies query
                  if (validationError) {
                    setValidationError(null);
                  }
                }}
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
            
            {/* Validation Error Display */}
            {validationError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                <FiAlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-red-800">
                    {validationError.typeDisplay}
                  </h4>
                  <p className="text-sm text-red-700 mt-1">
                    {validationError.message}
                  </p>
                </div>
              </div>
            )}
          </div>


          <div className="flex gap-2">
            <button
              onClick={handleAnalyze}
              disabled={loading || !query.trim()}
              className="btn-primary px-4 py-2 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <FiPlay className="h-4 w-4" />
                  <span>Analyze Query</span>
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

      {/* Original Query Display - Show in view mode */}
      {mode === 'view' && originalQuery && (
        <div className="card mb-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold text-gray-900">Original Query</h3>
            <button
              onClick={() => {
                const formatted = formatSQL(originalQuery);
                copyToClipboard(formatted);
                toast.success('Formatted query copied!');
              }}
              className="btn-secondary btn-sm"
              title="Copy formatted query"
            >
              <FiCopy className="h-4 w-4" />
            </button>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <MonacoEditor
              height="200px"
              defaultLanguage="sql"
              value={formatSQL(originalQuery)}
              theme="vs-light"
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                wordWrap: 'off',
                renderWhitespace: 'none',
                folding: true,
                lineDecorationsWidth: 0,
                lineNumbersMinChars: 3
              }}
            />
          </div>
        </div>
      )}

      {/* Agentic Workflow Stages Display - Show during and after analysis */}
      {(showProgress || (mode === 'view' && result && (Object.keys(stageData).length > 0 || result.metadata?.stages))) && (
        <motion.div
          ref={agenticWorkflowRef}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card mb-4"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Agentic Workflow Stages</h3>
          <div className="space-y-2">
            {/* Stage 1: Metadata Extraction Agent */}
            <div>
              <button
                onClick={() => getStageData('metadata') && setSelectedStage(selectedStage === 'metadata' ? null : 'metadata')}
                disabled={!getStageData('metadata')}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  getStageData('metadata') 
                    ? 'bg-green-50 hover:bg-green-100 cursor-pointer' 
                    : currentStep === 0 
                      ? 'bg-yellow-50 border-2 border-yellow-300 animate-pulse'
                      : 'bg-gray-50 cursor-not-allowed'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    {getStageData('metadata') ? (
                      <FiCheckCircle className="h-5 w-5 text-green-600" />
                    ) : currentStep === 0 ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-yellow-600 border-t-transparent" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                    )}
                    <span className={`font-medium ${!getStageData('metadata') && currentStep !== 0 ? 'text-gray-400' : ''}`}>
                      Metadata Extraction Agent
                    </span>
                  </div>
                  <span className="text-sm text-gray-600">
                    {getStageData('metadata') 
                      ? `${getStageData('metadata').tables_found} table(s), ${formatGBSize(getStageData('metadata').total_size_gb)}${getStageData('metadata').execution_time ? ` • ${getStageData('metadata').execution_time}s` : ''}`
                      : currentStep === 0 
                        ? 'Processing...'
                        : 'Waiting...'}
                  </span>
                </div>
              </button>
              {selectedStage === 'metadata' && getStageData('metadata') && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="ml-7 mt-2 p-3 bg-white rounded-lg border border-blue-200"
                >
                  {/* View toggle and copy button */}
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setMetadataView('rendered')}
                        className={`px-3 py-1 text-xs rounded ${
                          (!metadataView || metadataView === 'rendered') 
                            ? 'bg-blue-500 text-white' 
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        <FiLayout className="inline mr-1" />
                        Formatted View
                      </button>
                      <button
                        onClick={() => setMetadataView('json')}
                        className={`px-3 py-1 text-xs rounded ${
                          metadataView === 'json' 
                            ? 'bg-blue-500 text-white' 
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        <FiCode className="inline mr-1" />
                        Raw JSON
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(getStageData('metadata'), null, 2));
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-1"
                    >
                      {copied ? <FiCheck className="text-green-600" /> : <FiCopy />}
                      {copied ? 'Copied!' : 'Copy JSON'}
                    </button>
                  </div>

                  {/* Rendered view */}
                  {(!metadataView || metadataView === 'rendered') && (
                    <div className="space-y-3">
                      {getStageData('metadata').tables && getStageData('metadata').tables.map((table, idx) => (
                        <div key={idx} className="border-l-4 border-blue-400 pl-4 py-2 bg-gray-50 rounded">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-semibold text-sm">{table.table_name}</span>
                            {table.table_type === 'VIEW' && (
                              <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">VIEW</span>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-gray-500">Rows:</span> {table.row_count?.toLocaleString()}
                            </div>
                            <div>
                              <span className="text-gray-500">Size:</span> {formatGBSize(table.size_gb)}
                            </div>
                            {table.partitioned && (
                              <div className="col-span-2">
                                <span className="text-gray-500">Partitioned:</span> ✓ on {table.partition_field}
                              </div>
                            )}
                            {table.clustered && (
                              <div className="col-span-2">
                                <span className="text-gray-500">Clustered:</span> ✓ on {table.cluster_fields?.join(', ')}
                              </div>
                            )}
                          </div>

                          {/* View underlying tables */}
                          {table.view_definition && (
                            <div className="mt-3 p-2 bg-purple-50 rounded">
                              <div className="text-xs font-semibold text-purple-700 mb-2">
                                Underlying Tables ({table.view_definition.underlying_tables_count}):
                              </div>
                              {table.view_definition.underlying_tables?.map((ut, utIdx) => (
                                <div key={utIdx} className="text-xs ml-2 mb-1">
                                  • {ut.table_name}: {formatGBSize(ut.size_gb)}, {ut.row_count?.toLocaleString()} rows
                                  {ut.partitioned && ' (Partitioned)'}
                                  {ut.clustered && ' (Clustered)'}
                                </div>
                              ))}
                              <div className="text-xs text-purple-600 mt-2">
                                Total: {formatGBSize(table.view_definition.total_underlying_size_gb)}, 
                                {' '}{table.view_definition.total_underlying_rows?.toLocaleString()} rows
                              </div>
                            </div>
                          )}

                          <div className="mt-2 text-xs text-gray-500">
                            <span className="font-medium">Columns ({table.column_names?.length}):</span>
                            <span className="ml-2">
                              {table.column_names?.slice(0, 5).join(', ')}
                              {table.column_names?.length > 5 && ` ... +${table.column_names.length - 5} more`}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* JSON view */}
                  {metadataView === 'json' && (
                    <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto" style={{maxHeight: '400px', overflowY: 'auto'}}>
                      {JSON.stringify(getStageData('metadata'), null, 2)}
                    </pre>
                  )}
                </motion.div>
              )}
            </div>

            {/* Stage 2: Rule Analysis Agent */}
            <div>
              <button
                onClick={() => getStageData('rules') && setSelectedStage(selectedStage === 'rules' ? null : 'rules')}
                disabled={!getStageData('rules')}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  getStageData('rules') 
                    ? 'bg-green-50 hover:bg-green-100 cursor-pointer' 
                    : currentStep === 1 
                      ? 'bg-yellow-50 border-2 border-yellow-300 animate-pulse'
                      : 'bg-gray-50 cursor-not-allowed'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    {getStageData('rules') ? (
                      <FiCheckCircle className="h-5 w-5 text-green-600" />
                    ) : currentStep === 1 ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-yellow-600 border-t-transparent" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                    )}
                    <span className={`font-medium ${!getStageData('rules') && currentStep !== 1 ? 'text-gray-400' : ''}`}>
                      Query Anti Pattern Analysis Agent
                    </span>
                  </div>
                  <span className="text-sm text-gray-600">
                    {getStageData('rules') 
                      ? `${getStageData('rules').violations_found} issue(s) found${getStageData('rules').execution_time ? ` • ${getStageData('rules').execution_time}s` : ''}`
                      : currentStep === 1 
                        ? 'Processing...'
                        : 'Waiting...'}
                  </span>
                </div>
              </button>
              {selectedStage === 'rules' && getStageData('rules') && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="ml-7 mt-2 p-3 bg-white rounded-lg border border-yellow-200"
                >
                  {/* View toggle and copy button */}
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setRulesView('rendered')}
                        className={`px-3 py-1 text-xs rounded ${
                          rulesView === 'rendered' 
                            ? 'bg-yellow-500 text-white' 
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        <FiLayout className="inline mr-1" />
                        Formatted View
                      </button>
                      <button
                        onClick={() => setRulesView('json')}
                        className={`px-3 py-1 text-xs rounded ${
                          rulesView === 'json' 
                            ? 'bg-yellow-500 text-white' 
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        <FiCode className="inline mr-1" />
                        Raw JSON
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(getStageData('rules'), null, 2));
                        setCopiedStage('rules');
                        setTimeout(() => setCopiedStage(null), 2000);
                      }}
                      className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-1"
                    >
                      {copiedStage === 'rules' ? <FiCheck className="text-green-600" /> : <FiCopy />}
                      {copiedStage === 'rules' ? 'Copied!' : 'Copy JSON'}
                    </button>
                  </div>

                  {/* Rendered view */}
                  {rulesView === 'rendered' && (
                    <div className="space-y-3">
                      <div className="bg-yellow-50 p-3 rounded">
                        <div className="text-sm font-semibold mb-2">Compliance Analysis</div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-gray-500">Rules Checked:</span> {getStageData('rules').rules_checked}
                          </div>
                          <div>
                            <span className="text-gray-500">Violations Found:</span> {getStageData('rules').violations_found}
                          </div>
                          <div>
                            <span className="text-gray-500">Compliance Score:</span> {getStageData('rules').compliance_score}%
                          </div>
                          <div>
                            <span className="text-gray-500">Status:</span> 
                            <span className={`ml-1 ${getStageData('rules').compliance_score >= 90 ? 'text-green-600' : 'text-yellow-600'}`}>
                              {getStageData('rules').compliance_score >= 90 ? 'Good' : 'Needs Improvement'}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {getStageData('rules').violations && getStageData('rules').violations.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-semibold text-yellow-700">Violations Found:</div>
                          {getStageData('rules').violations.map((violation, idx) => (
                            <div key={idx} className="border-l-4 border-yellow-400 pl-3 py-2 bg-gray-50 rounded">
                              <div className="font-medium text-sm">{violation.rule_id}</div>
                              <div className="text-xs text-gray-600 mt-1">
                                <span className="font-medium">Fix:</span> {violation.fix}
                              </div>
                              {violation.impact && (
                                <div className="text-xs text-red-600 mt-1">
                                  <span className="font-medium">Impact:</span> {violation.impact}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* JSON view */}
                  {rulesView === 'json' && (
                    <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto" style={{maxHeight: '400px', overflowY: 'auto'}}>
                      {JSON.stringify(getStageData('rules'), null, 2)}
                    </pre>
                  )}
                </motion.div>
              )}
            </div>

            {/* Stage 3: Query Optimization Agent */}
            <div>
              <button
                onClick={() => getStageData('optimization') && setSelectedStage(selectedStage === 'optimization' ? null : 'optimization')}
                disabled={!getStageData('optimization')}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  getStageData('optimization') 
                    ? 'bg-green-50 hover:bg-green-100 cursor-pointer' 
                    : currentStep === 2 
                      ? 'bg-yellow-50 border-2 border-yellow-300 animate-pulse'
                      : 'bg-gray-50 cursor-not-allowed'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    {getStageData('optimization') ? (
                      <FiCheckCircle className="h-5 w-5 text-green-600" />
                    ) : currentStep === 2 ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-yellow-600 border-t-transparent" />
                    ) : analysisStatus === 'completed' || analysisStatus === 'failed' ? (
                      <FiXCircle className="h-5 w-5 text-gray-400" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                    )}
                    <span className={`font-medium ${!getStageData('optimization') && currentStep !== 2 ? 'text-gray-400' : ''}`}>
                      Query Optimization Agent
                    </span>
                  </div>
                  <span className="text-sm text-gray-600">
                    {getStageData('optimization') 
                      ? `${getStageData('optimization').total_optimizations} optimization(s) applied${getStageData('optimization').execution_time ? ` • ${getStageData('optimization').execution_time}s` : ''}`
                      : currentStep === 2 
                        ? 'Processing...'
                        : analysisStatus === 'completed' || analysisStatus === 'failed'
                          ? 'Not completed'
                          : 'Waiting...'}
                  </span>
                </div>
              </button>
              {selectedStage === 'optimization' && getStageData('optimization') && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="ml-7 mt-2 p-3 bg-white rounded-lg border border-blue-200"
                >
                  {/* View toggle and copy button */}
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setOptimizationView('rendered')}
                        className={`px-3 py-1 text-xs rounded ${
                          optimizationView === 'rendered' 
                            ? 'bg-blue-500 text-white' 
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        <FiLayout className="inline mr-1" />
                        Formatted View
                      </button>
                      <button
                        onClick={() => setOptimizationView('json')}
                        className={`px-3 py-1 text-xs rounded ${
                          optimizationView === 'json' 
                            ? 'bg-blue-500 text-white' 
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        <FiCode className="inline mr-1" />
                        Raw JSON
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(getStageData('optimization'), null, 2));
                        setCopiedStage('optimization');
                        setTimeout(() => setCopiedStage(null), 2000);
                      }}
                      className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-1"
                    >
                      {copiedStage === 'optimization' ? <FiCheck className="text-green-600" /> : <FiCopy />}
                      {copiedStage === 'optimization' ? 'Copied!' : 'Copy JSON'}
                    </button>
                  </div>

                  {/* Rendered view */}
                  {optimizationView === 'rendered' && (
                    <div className="space-y-3">
                      {/* Show optimized query */}
                      {getStageData('optimization').optimized_query && (
                        <div className="bg-gray-900 text-gray-100 rounded p-3">
                          <div className="text-sm font-semibold mb-2">Optimized Query</div>
                          <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                            {formatSQL(getStageData('optimization').optimized_query)}
                          </pre>
                        </div>
                      )}
                      
                      {/* Show optimizations applied */}
                      {getStageData('optimization').optimizations_applied && getStageData('optimization').optimizations_applied.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-semibold text-blue-700">Optimizations Applied:</div>
                          {getStageData('optimization').optimizations_applied.map((optimization, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-xs">
                              <FiCheckCircle className="h-3 w-3 text-green-600 mt-0.5 flex-shrink-0" />
                              <span className="text-gray-700">{optimization}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Show performance improvement if available */}
                      {getStageData('optimization').performance_improvement && (
                        <div className="bg-gradient-to-r from-green-50 to-blue-50 p-4 rounded-lg border border-green-200">
                          <div className="text-sm font-bold text-green-800 mb-2">
                            Performance Improvement
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div className="text-center">
                              <div className="text-2xl font-bold text-green-600">
                                {getStageData('optimization').performance_improvement.percentage_reduction}%
                              </div>
                              <div className="text-xs text-gray-600">Reduction</div>
                            </div>
                            <div className="text-center">
                              <div className="text-lg font-bold text-blue-600">
                                {getStageData('optimization').performance_improvement.bytes_saved_formatted}
                              </div>
                              <div className="text-xs text-gray-600">Data Saved</div>
                            </div>
                            <div className="text-center">
                              <div className="text-lg font-bold text-purple-600">
                                ${getStageData('optimization').performance_improvement.cost_saved_usd}
                              </div>
                              <div className="text-xs text-gray-600">Cost Saved</div>
                            </div>
                          </div>
                          {getStageData('optimization').summary && (
                            <div className="text-xs text-gray-700 mt-3 pt-3 border-t border-green-200">
                              {getStageData('optimization').summary}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* JSON view */}
                  {optimizationView === 'json' && (
                    <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto" style={{maxHeight: '400px', overflowY: 'auto'}}>
                      {JSON.stringify(getStageData('optimization'), null, 2)}
                    </pre>
                  )}
                </motion.div>
              )}
            </div>

            {/* Stage 4: Query Validation Agent */}
            <div>
              <button
                onClick={() => getStageData('validation_output') && setSelectedStage(selectedStage === 'validation_output' ? null : 'validation_output')}
                disabled={!getStageData('validation_output')}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  getStageData('validation_output') 
                    ? 'bg-green-50 hover:bg-green-100 cursor-pointer' 
                    : currentStep === 3 
                      ? 'bg-yellow-50 border-2 border-yellow-300 animate-pulse'
                      : 'bg-gray-50 cursor-not-allowed'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    {getStageData('validation_output') ? (
                      <FiCheckCircle className="h-5 w-5 text-green-600" />
                    ) : currentStep === 3 ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-yellow-600 border-t-transparent" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                    )}
                    <span className={`font-medium ${!getStageData('validation_output') && currentStep !== 3 ? 'text-gray-400' : ''}`}>
                      Query Validation Agent
                    </span>
                  </div>
                  <span className="text-sm text-gray-600">
                    {getStageData('validation_output') 
                      ? `Complete${getStageData('validation_output').execution_time ? ` • ${getStageData('validation_output').execution_time}s` : ''}`
                      : currentStep === 3 
                        ? 'Processing...'
                        : 'Waiting...'}
                  </span>
                </div>
              </button>
              {selectedStage === 'validation_output' && getStageData('validation_output') && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="ml-7 mt-2 p-3 bg-white rounded-lg border border-green-200"
                >
                  {/* View toggle and copy button */}
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setReportView('rendered')}
                        className={`px-3 py-1 text-xs rounded ${
                          reportView === 'rendered' 
                            ? 'bg-green-500 text-white' 
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        <FiLayout className="inline mr-1" />
                        Formatted View
                      </button>
                      <button
                        onClick={() => setReportView('json')}
                        className={`px-3 py-1 text-xs rounded ${
                          reportView === 'json' 
                            ? 'bg-green-500 text-white' 
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        <FiCode className="inline mr-1" />
                        Raw JSON
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(getStageData('validation_output'), null, 2));
                        setCopiedStage('validation_output');
                        setTimeout(() => setCopiedStage(null), 2000);
                      }}
                      className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-1"
                    >
                      {copiedStage === 'validation_output' ? <FiCheck className="text-green-600" /> : <FiCopy />}
                      {copiedStage === 'validation_output' ? 'Copied!' : 'Copy JSON'}
                    </button>
                  </div>

                  {/* Rendered view */}
                  {reportView === 'rendered' && (
                    <div className="space-y-3">
                      {/* Validation Checklist - Only 2 checks */}
                      {getStageData('validation_output') && (
                        <div className="space-y-2">
                          {/* Syntactic Validation Check */}
                          <div className="flex items-start gap-2 text-xs">
                            {(() => {
                              const validationOutput = getStageData('validation_output');
                              // Check if syntactic validation passed by looking at multiple indicators:
                              // 1. If syntactic_validation.status is explicitly PASSED
                              // 2. If dry_run_success is true (means syntax is valid)
                              // 3. If validation message indicates syntax is valid
                              const syntaxValid = 
                                validationOutput.syntactic_validation?.status === 'PASSED' ||
                                validationOutput.dry_run_success === true ||
                                (validationOutput.syntactic_validation?.message && 
                                 validationOutput.syntactic_validation.message.toLowerCase().includes('valid')) ||
                                (!validationOutput.syntactic_validation && 
                                 validationOutput.validation_message && 
                                 validationOutput.validation_message.toLowerCase().includes('syntax is valid'));
                              
                              return syntaxValid ? (
                                <FiCheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                              ) : (
                                <FiX className="h-4 w-4 text-red-600 mt-0.5" />
                              );
                            })()}
                            <div>
                              <span className="text-gray-700 font-medium">Syntactic validation</span>
                              <div className="text-gray-500 mt-0.5">
                                {getStageData('validation_output').syntactic_validation ? (
                                  getStageData('validation_output').syntactic_validation.message || 
                                  (getStageData('validation_output').syntactic_validation.status === 'PASSED' 
                                    ? 'Query syntax is valid, all tables and columns exist.'
                                    : `Syntax error: ${getStageData('validation_output').syntactic_validation.error_details || 'Invalid query syntax'}`)
                                ) : (
                                  getStageData('validation_output').validation_message || 'Query syntax is valid and executable.'
                                )}
                              </div>
                            </div>
                          </div>
                          
                          {/* Schema Validation Check */}
                          <div className="flex items-start gap-2 text-xs">
                            {(() => {
                              const schemaStatus = getStageData('validation_output').schema_validation?.status || 
                                                  (getStageData('validation_output').schema_validation?.status === 'MATCH' ? 'PASSED' : 'FAILED');
                              return schemaStatus === 'PASSED' || schemaStatus === 'MATCH' ? (
                                <FiCheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                              ) : schemaStatus === 'WARNING' ? (
                                <FiAlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                              ) : (
                                <FiX className="h-4 w-4 text-red-600 mt-0.5" />
                              );
                            })()}
                            <div>
                              <span className="text-gray-700 font-medium">Schema validation</span>
                              <div className="text-gray-500 mt-0.5">
                                {(() => {
                                  const validation = getStageData('validation_output').schema_validation;
                                  if (!validation) {
                                    return 'Schema validation complete.';
                                  }
                                  
                                  if (validation.message) {
                                    return validation.message;
                                  }
                                  
                                  if (validation.status === 'MATCH' || validation.status === 'PASSED') {
                                    const columnCount = validation.original_columns || validation.original_schema?.column_count || 
                                                       validation.optimized_columns || validation.optimized_schema?.column_count || 0;
                                    return `Schemas match: ${columnCount} columns with same types.`;
                                  } else if (validation.status === 'WARNING') {
                                    return 'Schemas match but column order may differ.';
                                  } else {
                                    const origCols = validation.original_columns || validation.original_schema?.column_count || 0;
                                    const optCols = validation.optimized_columns || validation.optimized_schema?.column_count || 0;
                                    return validation.differences?.[0] || 
                                           `Schema mismatch: Original has ${origCols} columns, Optimized has ${optCols} columns.`;
                                  }
                                })()}
                              </div>
                            </div>
                          </div>
                          
                          {/* Note/Summary */}
                          {(getStageData('validation_output').recommendation || 
                            (getStageData('validation_output').validation_details && 
                             getStageData('validation_output').validation_details.warnings && 
                             getStageData('validation_output').validation_details.warnings.length > 0)) && (
                            <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded mt-2">
                              <span className="font-semibold">Note:</span> {
                                getStageData('validation_output').validation_details?.warnings?.[0] || 
                                getStageData('validation_output').recommendation?.substring(0, 200) + '...'
                              }
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* JSON view */}
                  {reportView === 'json' && (
                    <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto" style={{maxHeight: '400px', overflowY: 'auto'}}>
                      {JSON.stringify(getStageData('validation_output'), null, 2)}
                    </pre>
                  )}
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Optimization Impact */}
      {mode === 'view' && result && !result.error && renderOptimizationImpact()}

      {/* Optimized Query Output */}
      {mode === 'view' && result && result.optimizedQuery && !result.error && (
        <div className="card">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold text-gray-900">Optimized Query</h3>
            <button
              onClick={() => {
                const formatted = formatSQL(result.optimizedQuery);
                copyToClipboard(formatted);
              }}
              className="btn-secondary btn-sm"
              title="Copy query"
            >
              <FiCopy className="h-4 w-4" />
            </button>
          </div>
          <div className="border rounded-lg overflow-hidden bg-green-50">
            <MonacoEditor
              height="300px"
              defaultLanguage="sql"
              value={formatSQL(result.optimizedQuery)}
              theme="vs-light"
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                wordWrap: 'off',
                formatOnPaste: true,
                formatOnType: true,
                renderWhitespace: 'none',
                folding: true,
                lineDecorationsWidth: 0,
                lineNumbersMinChars: 3
              }}
            />
          </div>
          
          {/* High-level metrics for optimized query */}
          {getStageData('optimization') && getStageData('optimization').performance_improvement && (
            <div className="mt-4 bg-gradient-to-r from-blue-50 to-green-50 border border-blue-200 rounded-lg p-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {getStageData('optimization').performance_improvement.percentage_reduction || 0}%
                  </div>
                  <div className="text-sm text-gray-600">Expected Cost Reduction</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {getStageData('optimization').performance_improvement.bytes_saved_formatted || '0 B'}
                  </div>
                  <div className="text-sm text-gray-600">Data Saved</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    ${(getStageData('optimization').performance_improvement.cost_saved_usd || 0).toFixed(2)}
                  </div>
                  <div className="text-sm text-gray-600">Expected Cost Saving</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {getStageData('optimization').total_optimizations || 0}
                  </div>
                  <div className="text-sm text-gray-600">Optimizations Applied</div>
                </div>
              </div>
            </div>
          )}
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