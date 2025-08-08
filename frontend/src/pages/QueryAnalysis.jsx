import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const QueryAnalysis = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Generate new analysis ID and redirect
    const newAnalysisId = 'analysis-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    navigate(`/query-analysis/${newAnalysisId}`, { replace: true, state: { isNew: true } });
  }, [navigate]);

  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>
  );
};

export default QueryAnalysis;