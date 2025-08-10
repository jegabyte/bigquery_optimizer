// Mock data for Projects → Jobs functionality

export const mockProjects = [
  {
    id: 'proj-1',
    projectId: 'analytics-prod-394821',
    name: 'Analytics Production',
    lastUpdated: new Date('2025-01-10T08:30:00'),
    analysisWindow: 30,
    regions: ['us-central1', 'us-east1'],
    datasets: ['ecommerce', 'marketing', 'user_analytics'],
    pricingMode: 'on-demand',
    pricePerTB: 5.00,
    stats: {
      templatesDiscovered: 247,
      totalRuns: 15420,
      estimatedMonthlySpend: 3240.50,
      potentialSavings: 972.15,
      complianceScore: 72
    },
    topCostDrivers: [
      { name: 'User Attribution Query', bytesProcessed: '2.4 TB', runs: 480, cost: 12.00 },
      { name: 'Daily Revenue Aggregation', bytesProcessed: '1.8 TB', runs: 30, cost: 9.00 },
      { name: 'Product Performance Report', bytesProcessed: '1.2 TB', runs: 120, cost: 6.00 },
      { name: 'Customer Segmentation', bytesProcessed: '980 GB', runs: 60, cost: 4.90 },
      { name: 'Marketing Campaign Analysis', bytesProcessed: '720 GB', runs: 90, cost: 3.60 }
    ]
  },
  {
    id: 'proj-2',
    projectId: 'data-warehouse-staging',
    name: 'Data Warehouse Staging',
    lastUpdated: new Date('2025-01-10T07:15:00'),
    analysisWindow: 7,
    regions: ['us-central1'],
    datasets: ['staging', 'temp', 'etl_jobs'],
    pricingMode: 'flat-rate',
    pricePerTB: 4.00,
    stats: {
      templatesDiscovered: 89,
      totalRuns: 3250,
      estimatedMonthlySpend: 850.00,
      potentialSavings: 340.00,
      complianceScore: 65
    },
    topCostDrivers: [
      { name: 'ETL Data Validation', bytesProcessed: '890 GB', runs: 210, cost: 3.56 },
      { name: 'Staging Table Refresh', bytesProcessed: '650 GB', runs: 180, cost: 2.60 },
      { name: 'Data Quality Checks', bytesProcessed: '420 GB', runs: 420, cost: 1.68 },
      { name: 'Schema Migration', bytesProcessed: '380 GB', runs: 15, cost: 1.52 },
      { name: 'Backup Verification', bytesProcessed: '220 GB', runs: 30, cost: 0.88 }
    ]
  },
  {
    id: 'proj-3',
    projectId: 'ml-experiments-2024',
    name: 'ML Experiments',
    lastUpdated: new Date('2025-01-09T18:45:00'),
    analysisWindow: 90,
    regions: ['us-west1', 'europe-west1'],
    datasets: ['ml_datasets', 'feature_store', 'model_outputs'],
    pricingMode: 'on-demand',
    pricePerTB: 5.00,
    stats: {
      templatesDiscovered: 156,
      totalRuns: 8930,
      estimatedMonthlySpend: 2150.75,
      potentialSavings: 645.23,
      complianceScore: 58
    },
    topCostDrivers: [
      { name: 'Feature Engineering Pipeline', bytesProcessed: '3.1 TB', runs: 90, cost: 15.50 },
      { name: 'Model Training Data Prep', bytesProcessed: '2.2 TB', runs: 45, cost: 11.00 },
      { name: 'Prediction Batch Jobs', bytesProcessed: '1.5 TB', runs: 360, cost: 7.50 },
      { name: 'Feature Store Updates', bytesProcessed: '890 GB', runs: 720, cost: 4.45 },
      { name: 'Model Performance Metrics', bytesProcessed: '450 GB', runs: 180, cost: 2.25 }
    ]
  }
];

export const mockTemplates = [
  {
    id: 'tmpl-1',
    projectId: 'proj-1',
    sqlSnippet: 'SELECT user_id, COUNT(*) as purchase_count, SUM(revenue) as total_revenue FROM `analytics-prod.ecommerce.transactions`',
    fullSql: `SELECT 
  user_id,
  COUNT(*) as purchase_count,
  SUM(revenue) as total_revenue,
  AVG(revenue) as avg_order_value,
  MAX(transaction_date) as last_purchase_date
FROM \`analytics-prod.ecommerce.transactions\`
WHERE transaction_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
  AND status = 'completed'
GROUP BY user_id
ORDER BY total_revenue DESC
LIMIT 1000`,
    tables: ['ecommerce.transactions', 'ecommerce.users'],
    runs: 480,
    runsPerDay: 16,
    bytesProcessedP90: 2.4e12, // 2.4 TB
    bytesProcessedP99: 2.8e12,
    slotMsP50: 125000,
    runtimeP50: 8.5,
    firstSeen: new Date('2024-11-15'),
    lastSeen: new Date('2025-01-10T06:30:00'),
    state: 'analyzed',
    lastAnalysis: new Date('2025-01-08'),
    complianceScore: 75,
    issues: [
      { severity: 'high', rule: 'SELECT_STAR', impact: 'High scan cost', description: 'Query uses SELECT * which scans all columns' },
      { severity: 'medium', rule: 'NO_PARTITION_FILTER', impact: 'Full table scan', description: 'Missing partition filter on transaction_date' },
      { severity: 'low', rule: 'LARGE_LIMIT', impact: 'Memory usage', description: 'LIMIT 1000 may cause memory issues' }
    ],
    optimizedSql: `SELECT 
  user_id,
  COUNT(*) as purchase_count,
  SUM(revenue) as total_revenue,
  AVG(revenue) as avg_order_value,
  MAX(transaction_date) as last_purchase_date
FROM \`analytics-prod.ecommerce.transactions\`
WHERE transaction_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
  AND transaction_date <= CURRENT_DATE()  -- Added upper bound
  AND status = 'completed'
  AND _PARTITIONDATE >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)  -- Partition filter
GROUP BY user_id
ORDER BY total_revenue DESC
LIMIT 100`,
    estimatedSavings: { before: 12.00, after: 8.40, reduction: 30 }
  },
  {
    id: 'tmpl-2',
    projectId: 'proj-1',
    sqlSnippet: 'WITH daily_revenue AS (SELECT DATE(order_date) as date, SUM(amount) as revenue FROM `analytics-prod.ecommerce.orders`',
    fullSql: `WITH daily_revenue AS (
  SELECT 
    DATE(order_date) as date,
    SUM(amount) as revenue,
    COUNT(*) as order_count
  FROM \`analytics-prod.ecommerce.orders\`
  WHERE order_date >= '2024-01-01'
  GROUP BY date
)
SELECT 
  date,
  revenue,
  order_count,
  AVG(revenue) OVER (ORDER BY date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) as revenue_7d_avg
FROM daily_revenue
ORDER BY date DESC`,
    tables: ['ecommerce.orders'],
    runs: 30,
    runsPerDay: 1,
    bytesProcessedP90: 1.8e12,
    bytesProcessedP99: 2.0e12,
    slotMsP50: 95000,
    runtimeP50: 6.2,
    firstSeen: new Date('2024-10-01'),
    lastSeen: new Date('2025-01-10T02:00:00'),
    state: 'validated',
    lastAnalysis: new Date('2025-01-09'),
    complianceScore: 82,
    issues: [
      { severity: 'medium', rule: 'WIDE_DATE_RANGE', impact: 'Large scan', description: 'Scanning full year of data' }
    ],
    optimizedSql: `WITH daily_revenue AS (
  SELECT 
    DATE(order_date) as date,
    SUM(amount) as revenue,
    COUNT(*) as order_count
  FROM \`analytics-prod.ecommerce.orders\`
  WHERE _PARTITIONDATE >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
    AND order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
  GROUP BY date
)
SELECT 
  date,
  revenue,
  order_count,
  AVG(revenue) OVER (ORDER BY date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) as revenue_7d_avg
FROM daily_revenue
WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
ORDER BY date DESC`,
    estimatedSavings: { before: 9.00, after: 2.70, reduction: 70 }
  },
  {
    id: 'tmpl-3',
    projectId: 'proj-1',
    sqlSnippet: 'SELECT p.*, c.category_name, s.supplier_name FROM `analytics-prod.ecommerce.products` p',
    fullSql: `SELECT 
  p.*,
  c.category_name,
  c.category_type,
  s.supplier_name,
  s.supplier_region
FROM \`analytics-prod.ecommerce.products\` p
LEFT JOIN \`analytics-prod.ecommerce.categories\` c ON p.category_id = c.id
LEFT JOIN \`analytics-prod.ecommerce.suppliers\` s ON p.supplier_id = s.id
WHERE p.status = 'active'
ORDER BY p.revenue DESC`,
    tables: ['ecommerce.products', 'ecommerce.categories', 'ecommerce.suppliers'],
    runs: 120,
    runsPerDay: 4,
    bytesProcessedP90: 1.2e12,
    bytesProcessedP99: 1.4e12,
    slotMsP50: 78000,
    runtimeP50: 5.1,
    firstSeen: new Date('2024-09-15'),
    lastSeen: new Date('2025-01-10T04:15:00'),
    state: 'new',
    lastAnalysis: null,
    complianceScore: null,
    issues: [],
    optimizedSql: null,
    estimatedSavings: null
  },
  {
    id: 'tmpl-4',
    projectId: 'proj-1',
    sqlSnippet: 'SELECT customer_id, segment, lifetime_value FROM `analytics-prod.marketing.customer_segments`',
    fullSql: `SELECT 
  customer_id,
  segment,
  lifetime_value,
  last_activity_date,
  engagement_score
FROM \`analytics-prod.marketing.customer_segments\`
WHERE lifetime_value > 0
  AND last_activity_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 180 DAY)
ORDER BY lifetime_value DESC`,
    tables: ['marketing.customer_segments'],
    runs: 60,
    runsPerDay: 2,
    bytesProcessedP90: 9.8e11,
    bytesProcessedP99: 1.1e12,
    slotMsP50: 65000,
    runtimeP50: 4.3,
    firstSeen: new Date('2024-12-01'),
    lastSeen: new Date('2025-01-09T22:30:00'),
    state: 'applied',
    lastAnalysis: new Date('2025-01-05'),
    complianceScore: 88,
    issues: [],
    optimizedSql: `SELECT 
  customer_id,
  segment,
  lifetime_value,
  last_activity_date,
  engagement_score
FROM \`analytics-prod.marketing.customer_segments\`
WHERE lifetime_value > 0
  AND last_activity_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 180 DAY)
  AND _PARTITIONDATE >= DATE_SUB(CURRENT_DATE(), INTERVAL 180 DAY)
ORDER BY lifetime_value DESC
LIMIT 10000`,
    estimatedSavings: { before: 4.90, after: 3.43, reduction: 30 }
  },
  {
    id: 'tmpl-5',
    projectId: 'proj-1',
    sqlSnippet: 'WITH campaign_performance AS (SELECT campaign_id, SUM(clicks) as total_clicks FROM `analytics-prod.marketing.ad_events`',
    fullSql: `WITH campaign_performance AS (
  SELECT 
    campaign_id,
    SUM(clicks) as total_clicks,
    SUM(impressions) as total_impressions,
    SUM(cost) as total_cost
  FROM \`analytics-prod.marketing.ad_events\`
  WHERE event_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
  GROUP BY campaign_id
)
SELECT 
  cp.*,
  c.campaign_name,
  c.campaign_type,
  cp.total_clicks / NULLIF(cp.total_impressions, 0) as ctr,
  cp.total_cost / NULLIF(cp.total_clicks, 0) as cpc
FROM campaign_performance cp
JOIN \`analytics-prod.marketing.campaigns\` c ON cp.campaign_id = c.id
ORDER BY total_cost DESC`,
    tables: ['marketing.ad_events', 'marketing.campaigns'],
    runs: 90,
    runsPerDay: 3,
    bytesProcessedP90: 7.2e11,
    bytesProcessedP99: 8.5e11,
    slotMsP50: 55000,
    runtimeP50: 3.6,
    firstSeen: new Date('2024-11-20'),
    lastSeen: new Date('2025-01-10T05:45:00'),
    state: 'snoozed',
    lastAnalysis: new Date('2024-12-15'),
    complianceScore: 79,
    issues: [
      { severity: 'low', rule: 'CROSS_JOIN_RISK', impact: 'Potential cartesian product', description: 'JOIN without proper filters' }
    ],
    optimizedSql: null,
    estimatedSavings: null
  },
  {
    id: 'tmpl-6',
    projectId: 'proj-2',
    sqlSnippet: 'INSERT INTO `staging.daily_aggregates` SELECT DATE(timestamp) as date, COUNT(*) FROM `staging.raw_events`',
    fullSql: `INSERT INTO \`staging.daily_aggregates\`
SELECT 
  DATE(timestamp) as date,
  COUNT(*) as event_count,
  COUNT(DISTINCT user_id) as unique_users,
  AVG(duration) as avg_duration
FROM \`staging.raw_events\`
WHERE DATE(timestamp) = CURRENT_DATE() - 1
GROUP BY date`,
    tables: ['staging.raw_events', 'staging.daily_aggregates'],
    runs: 210,
    runsPerDay: 7,
    bytesProcessedP90: 8.9e11,
    bytesProcessedP99: 1.0e12,
    slotMsP50: 42000,
    runtimeP50: 2.8,
    firstSeen: new Date('2024-08-01'),
    lastSeen: new Date('2025-01-10T07:00:00'),
    state: 'analyzed',
    lastAnalysis: new Date('2025-01-07'),
    complianceScore: 71,
    issues: [
      { severity: 'high', rule: 'NO_PARTITION_FILTER', impact: 'Full table scan', description: 'Missing partition filter' },
      { severity: 'medium', rule: 'DATE_FUNCTION_ON_COLUMN', impact: 'Index not used', description: 'DATE() prevents index usage' }
    ],
    optimizedSql: `INSERT INTO \`staging.daily_aggregates\`
SELECT 
  DATE(timestamp) as date,
  COUNT(*) as event_count,
  COUNT(DISTINCT user_id) as unique_users,
  AVG(duration) as avg_duration
FROM \`staging.raw_events\`
WHERE _PARTITIONDATE = CURRENT_DATE() - 1
  AND timestamp >= TIMESTAMP(CURRENT_DATE() - 1)
  AND timestamp < TIMESTAMP(CURRENT_DATE())
GROUP BY date`,
    estimatedSavings: { before: 3.56, after: 0.89, reduction: 75 }
  },
  {
    id: 'tmpl-7',
    projectId: 'proj-3',
    sqlSnippet: 'CREATE OR REPLACE TABLE `ml_datasets.training_data` AS SELECT * FROM `ml_datasets.feature_store`',
    fullSql: `CREATE OR REPLACE TABLE \`ml_datasets.training_data\` AS
SELECT *
FROM \`ml_datasets.feature_store\`
WHERE created_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
  AND feature_version = 'v2.3'`,
    tables: ['ml_datasets.feature_store', 'ml_datasets.training_data'],
    runs: 90,
    runsPerDay: 1,
    bytesProcessedP90: 3.1e12,
    bytesProcessedP99: 3.5e12,
    slotMsP50: 180000,
    runtimeP50: 12.0,
    firstSeen: new Date('2024-10-15'),
    lastSeen: new Date('2025-01-09T14:20:00'),
    state: 'validated',
    lastAnalysis: new Date('2025-01-06'),
    complianceScore: 68,
    issues: [
      { severity: 'high', rule: 'SELECT_STAR', impact: 'Unnecessary columns', description: 'Copying all columns wastes storage' },
      { severity: 'medium', rule: 'CREATE_OR_REPLACE', impact: 'Data loss risk', description: 'Overwrites existing table' }
    ],
    optimizedSql: `CREATE TABLE IF NOT EXISTS \`ml_datasets.training_data\` 
PARTITION BY DATE(created_date)
CLUSTER BY feature_id, model_id AS
SELECT 
  feature_id,
  model_id,
  feature_values,
  labels,
  created_date,
  feature_version
FROM \`ml_datasets.feature_store\`
WHERE _PARTITIONDATE >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
  AND created_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
  AND feature_version = 'v2.3'`,
    estimatedSavings: { before: 15.50, after: 9.30, reduction: 40 }
  }
];

export const getProjectTemplates = (projectId) => {
  return mockTemplates.filter(t => t.projectId === projectId);
};

export const getTemplateRuns = (templateId) => {
  // Generate mock runs for a template
  const runs = [];
  const template = mockTemplates.find(t => t.id === templateId);
  if (!template) return runs;

  const baseTime = new Date('2025-01-10T12:00:00');
  for (let i = 0; i < 20; i++) {
    const variance = Math.random() * 0.3 - 0.15; // ±15% variance
    runs.push({
      id: `run-${templateId}-${i}`,
      templateId,
      startTime: new Date(baseTime.getTime() - i * 3600000 * 4), // 4 hours apart
      endTime: new Date(baseTime.getTime() - i * 3600000 * 4 + 8500 + Math.random() * 3000),
      bytesProcessed: template.bytesProcessedP90 * (1 + variance),
      slotMs: template.slotMsP50 * (1 + variance),
      runtime: template.runtimeP50 * (1 + variance),
      jobId: `bqjob_${Math.random().toString(36).substr(2, 9)}`,
      labels: {
        team: 'analytics',
        environment: 'production',
        scheduled: i % 3 === 0 ? 'true' : 'false'
      },
      query: template.fullSql
    });
  }
  return runs;
};

export const templateStates = ['new', 'analyzed', 'validated', 'applied', 'snoozed'];

export const analysisRulesets = [
  { version: 'v2.1.0', date: '2025-01-08', rules: 22 },
  { version: 'v2.0.0', date: '2024-12-15', rules: 20 },
  { version: 'v1.9.0', date: '2024-11-20', rules: 18 }
];

export const formatBytes = (bytes) => {
  if (bytes < 1e9) return `${(bytes / 1e6).toFixed(0)} MB`;
  if (bytes < 1e12) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${(bytes / 1e12).toFixed(2)} TB`;
};

export const formatCost = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

export const formatRuntime = (seconds) => {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
};