// Mock data service for frontend-only operation
// This will be replaced with real ADK calls in Phase 5

export const mockOptimizationService = {
  async optimizeQuery(query) {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Mock analysis based on query patterns
    const issues = [];
    const suggestions = [];
    
    // Check for common issues
    if (query.toLowerCase().includes('select *')) {
      issues.push({
        type: 'SELECT_STAR',
        severity: 'high',
        description: 'Using SELECT * can scan unnecessary columns',
        line: 1,
        impact: 'Can increase query cost by 30-50%'
      });
      suggestions.push('Specify only required columns instead of SELECT *');
    }
    
    if (!query.toLowerCase().includes('where') && !query.toLowerCase().includes('limit')) {
      issues.push({
        type: 'NO_FILTER',
        severity: 'high',
        description: 'Query has no WHERE clause or LIMIT',
        line: 1,
        impact: 'Will scan entire table'
      });
      suggestions.push('Add WHERE clause to filter data or use LIMIT');
    }
    
    if (!query.toLowerCase().includes('partition')) {
      issues.push({
        type: 'NO_PARTITION_FILTER',
        severity: 'medium',
        description: 'Query does not filter on partition column',
        line: 1,
        impact: 'May scan unnecessary partitions'
      });
      suggestions.push('Filter on partition column (e.g., _PARTITIONTIME or date column)');
    }
    
    if (query.toLowerCase().includes('join') && !query.toLowerCase().includes('on')) {
      issues.push({
        type: 'CROSS_JOIN',
        severity: 'critical',
        description: 'Potential cross join detected',
        line: 1,
        impact: 'Can result in cartesian product'
      });
      suggestions.push('Ensure all JOINs have proper ON conditions');
    }
    
    if (query.toLowerCase().includes('order by') && !query.toLowerCase().includes('limit')) {
      issues.push({
        type: 'UNBOUNDED_ORDER_BY',
        severity: 'medium',
        description: 'ORDER BY without LIMIT',
        line: 1,
        impact: 'Sorting large result sets is expensive'
      });
      suggestions.push('Add LIMIT when using ORDER BY');
    }
    
    // Generate optimized query
    let optimizedQuery = query;
    
    // Simple optimizations
    if (query.toLowerCase().includes('select *')) {
      optimizedQuery = optimizedQuery.replace(/select\s+\*/gi, 'SELECT column1, column2, column3');
    }
    
    if (!query.toLowerCase().includes('where') && !query.toLowerCase().includes('limit')) {
      optimizedQuery += '\nWHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)\nLIMIT 1000';
    }
    
    // Mock validation result
    const originalCost = Math.random() * 10 + 5; // $5-$15
    const optimizedCost = originalCost * (0.3 + Math.random() * 0.4); // 30-70% of original
    const costSavings = ((originalCost - optimizedCost) / originalCost * 100).toFixed(1);
    
    return {
      originalQuery: query,
      optimizedQuery,
      issues,
      suggestions,
      validationResult: {
        originalCost: originalCost.toFixed(2),
        optimizedCost: optimizedCost.toFixed(2),
        costSavings: parseFloat(costSavings),
        bytesProcessedOriginal: Math.floor(Math.random() * 1000000000 + 500000000),
        bytesProcessedOptimized: Math.floor(Math.random() * 500000000 + 100000000),
        estimatedRowsOriginal: Math.floor(Math.random() * 1000000 + 100000),
        estimatedRowsOptimized: Math.floor(Math.random() * 500000 + 50000)
      },
      metadata: {
        optimizationTime: (Math.random() * 3 + 1).toFixed(2),
        rulesApplied: issues.length,
        optimizationScore: Math.floor(70 + Math.random() * 30)
      }
    };
  },
  
  async getProjects() {
    return [
      { id: 1, name: 'E-commerce Analytics', projectId: 'ecommerce-prod' },
      { id: 2, name: 'Marketing Dashboard', projectId: 'marketing-analytics' },
      { id: 3, name: 'Data Warehouse', projectId: 'data-warehouse-01' }
    ];
  },
  
  async getQueryHistory() {
    const queries = [
      {
        id: 1,
        query: 'SELECT * FROM analytics.user_events WHERE event_date >= "2024-01-01"',
        executionTime: 2.3,
        rowsProcessed: 1250000,
        bytesProcessed: 524288000,
        cost: 2.56,
        timestamp: new Date(Date.now() - 3600000).toISOString()
      },
      {
        id: 2,
        query: 'SELECT user_id, COUNT(*) FROM analytics.transactions GROUP BY user_id',
        executionTime: 1.8,
        rowsProcessed: 450000,
        bytesProcessed: 204800000,
        cost: 1.02,
        timestamp: new Date(Date.now() - 7200000).toISOString()
      },
      {
        id: 3,
        query: 'SELECT product_id, name, price FROM inventory.products WHERE category = "Electronics"',
        executionTime: 0.5,
        rowsProcessed: 12500,
        bytesProcessed: 10485760,
        cost: 0.05,
        timestamp: new Date(Date.now() - 10800000).toISOString()
      }
    ];
    
    return queries;
  },
  
  async getStorageInsights() {
    return [
      {
        tableName: 'user_events',
        datasetId: 'analytics',
        sizeGB: 245.8,
        partitioned: true,
        clustered: false,
        lastModified: '2024-01-15',
        optimization: 'Consider clustering on user_id for better performance'
      },
      {
        tableName: 'transactions',
        datasetId: 'finance',
        sizeGB: 128.3,
        partitioned: true,
        clustered: true,
        lastModified: '2024-01-14',
        optimization: 'Well optimized'
      },
      {
        tableName: 'product_catalog',
        datasetId: 'inventory',
        sizeGB: 45.2,
        partitioned: false,
        clustered: false,
        lastModified: '2024-01-10',
        optimization: 'Consider partitioning by date for historical data'
      }
    ];
  },
  
  async getDashboardStats() {
    return {
      totalQueries: 1248,
      totalSavings: 45.2,
      avgOptimizationTime: 2.3,
      queryTrend: [
        { date: '2024-01-10', count: 145 },
        { date: '2024-01-11', count: 168 },
        { date: '2024-01-12', count: 192 },
        { date: '2024-01-13', count: 156 },
        { date: '2024-01-14', count: 203 },
        { date: '2024-01-15', count: 189 },
        { date: '2024-01-16', count: 195 }
      ],
      costTrend: [
        { date: '2024-01-10', cost: 12.5 },
        { date: '2024-01-11', cost: 15.2 },
        { date: '2024-01-12', cost: 18.7 },
        { date: '2024-01-13', cost: 14.3 },
        { date: '2024-01-14', cost: 20.1 },
        { date: '2024-01-15', cost: 17.8 },
        { date: '2024-01-16', cost: 19.2 }
      ],
      topIssues: [
        { type: 'SELECT_STAR', count: 342 },
        { type: 'NO_PARTITION_FILTER', count: 287 },
        { type: 'NO_FILTER', count: 198 },
        { type: 'UNBOUNDED_ORDER_BY', count: 156 },
        { type: 'CROSS_JOIN', count: 45 }
      ]
    };
  }
};

// Progress tracking for optimization pipeline
export const createProgressTracker = (onProgress) => {
  const stages = [
    { id: 'metadata', name: 'Extracting Metadata', duration: 500 },
    { id: 'validation', name: 'Validating Rules', duration: 800 },
    { id: 'rewrite', name: 'Rewriting Query', duration: 1000 },
    { id: 'verify', name: 'Verifying Results', duration: 700 }
  ];
  
  let currentStage = 0;
  
  const runStages = async () => {
    for (let i = 0; i < stages.length; i++) {
      currentStage = i;
      onProgress({
        stage: stages[i].id,
        stageName: stages[i].name,
        progress: (i / stages.length) * 100,
        isComplete: false
      });
      
      await new Promise(resolve => setTimeout(resolve, stages[i].duration));
    }
    
    onProgress({
      stage: 'complete',
      stageName: 'Optimization Complete',
      progress: 100,
      isComplete: true
    });
  };
  
  return { runStages };
};