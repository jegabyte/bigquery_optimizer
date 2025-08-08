import Dexie from 'dexie';

// Create database instance
const db = new Dexie('BigQueryOptimizerDB');

// Define database schema
db.version(1).stores({
  projects: '++id, name, projectId, createdAt, updatedAt',
  analyses: '++id, analysisId, query, originalQuery, optimizedQuery, issues, validationResult, metadata, createdAt, updatedAt',
  queryHistory: '++id, query, projectId, executionTime, rowsProcessed, bytesProcessed, cost, timestamp',
  storageInsights: '++id, tableName, datasetId, projectId, sizeGB, partitioned, clustered, lastModified, timestamp',
  dashboardStats: 'id, totalQueries, totalSavings, avgOptimizationTime, topIssues, recentActivity, updatedAt'
});

// Helper functions for each collection

// Projects
export const projects = {
  async getAll() {
    return await db.projects.toArray();
  },
  
  async get(id) {
    return await db.projects.get(id);
  },
  
  async create(project) {
    const now = new Date().toISOString();
    return await db.projects.add({
      ...project,
      createdAt: now,
      updatedAt: now
    });
  },
  
  async update(id, updates) {
    return await db.projects.update(id, {
      ...updates,
      updatedAt: new Date().toISOString()
    });
  },
  
  async delete(id) {
    return await db.projects.delete(id);
  }
};

// Analyses
export const analyses = {
  async getAll() {
    return await db.analyses.orderBy('createdAt').reverse().toArray();
  },
  
  async getByAnalysisId(analysisId) {
    return await db.analyses.where('analysisId').equals(analysisId).first();
  },
  
  async create(analysis) {
    const now = new Date().toISOString();
    return await db.analyses.add({
      ...analysis,
      createdAt: now,
      updatedAt: now
    });
  },
  
  async update(analysisId, updates) {
    const analysis = await db.analyses.where('analysisId').equals(analysisId).first();
    if (analysis) {
      return await db.analyses.update(analysis.id, {
        ...updates,
        updatedAt: new Date().toISOString()
      });
    }
    return null;
  },
  
  async delete(id) {
    return await db.analyses.delete(id);
  }
};

// Query History
export const queryHistory = {
  async getAll(limit = 100) {
    return await db.queryHistory
      .orderBy('timestamp')
      .reverse()
      .limit(limit)
      .toArray();
  },
  
  async getByProject(projectId, limit = 50) {
    return await db.queryHistory
      .where('projectId')
      .equals(projectId)
      .reverse()
      .limit(limit)
      .toArray();
  },
  
  async create(entry) {
    return await db.queryHistory.add({
      ...entry,
      timestamp: new Date().toISOString()
    });
  },
  
  async delete(id) {
    return await db.queryHistory.delete(id);
  },
  
  async clearAll() {
    return await db.queryHistory.clear();
  }
};

// Storage Insights
export const storageInsights = {
  async getAll() {
    return await db.storageInsights.orderBy('timestamp').reverse().toArray();
  },
  
  async getByProject(projectId) {
    return await db.storageInsights
      .where('projectId')
      .equals(projectId)
      .toArray();
  },
  
  async create(insight) {
    return await db.storageInsights.add({
      ...insight,
      timestamp: new Date().toISOString()
    });
  },
  
  async update(id, updates) {
    return await db.storageInsights.update(id, updates);
  },
  
  async delete(id) {
    return await db.storageInsights.delete(id);
  },
  
  async bulkCreate(insights) {
    const timestamped = insights.map(insight => ({
      ...insight,
      timestamp: new Date().toISOString()
    }));
    return await db.storageInsights.bulkAdd(timestamped);
  }
};

// Dashboard Stats
export const dashboardStats = {
  async get() {
    return await db.dashboardStats.get('main');
  },
  
  async update(stats) {
    const existing = await db.dashboardStats.get('main');
    
    if (existing) {
      return await db.dashboardStats.update('main', {
        ...stats,
        updatedAt: new Date().toISOString()
      });
    } else {
      return await db.dashboardStats.add({
        id: 'main',
        ...stats,
        updatedAt: new Date().toISOString()
      });
    }
  },
  
  async calculateStats() {
    const allAnalyses = await db.analyses.toArray();
    const allHistory = await db.queryHistory.toArray();
    
    // Calculate total savings
    const totalSavings = allAnalyses.reduce((sum, analysis) => {
      const savings = analysis.validationResult?.costSavings || 0;
      return sum + savings;
    }, 0);
    
    // Calculate average optimization time
    const avgOptimizationTime = allAnalyses.length > 0
      ? allAnalyses.reduce((sum, a) => sum + (a.metadata?.optimizationTime || 0), 0) / allAnalyses.length
      : 0;
    
    // Count top issues
    const issueCount = {};
    allAnalyses.forEach(analysis => {
      if (analysis.issues) {
        analysis.issues.forEach(issue => {
          issueCount[issue.type] = (issueCount[issue.type] || 0) + 1;
        });
      }
    });
    
    const topIssues = Object.entries(issueCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }));
    
    // Get recent activity
    const recentActivity = allAnalyses
      .slice(0, 10)
      .map(a => ({
        id: a.analysisId,
        query: a.query?.substring(0, 100) + '...',
        timestamp: a.createdAt,
        savings: a.validationResult?.costSavings || 0
      }));
    
    return {
      totalQueries: allAnalyses.length,
      totalSavings,
      avgOptimizationTime,
      topIssues,
      recentActivity
    };
  }
};

// Initialize with mock data if database is empty (for demo purposes)
export async function initializeWithMockData() {
  const projectCount = await db.projects.count();
  
  if (projectCount === 0) {
    // Add mock projects
    await db.projects.bulkAdd([
      {
        name: 'E-commerce Analytics',
        projectId: 'ecommerce-prod',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        name: 'Marketing Dashboard',
        projectId: 'marketing-analytics',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        name: 'Data Warehouse',
        projectId: 'data-warehouse-01',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);
    
    // Add mock storage insights
    await storageInsights.bulkCreate([
      {
        tableName: 'user_events',
        datasetId: 'analytics',
        projectId: 'ecommerce-prod',
        sizeGB: 245.8,
        partitioned: true,
        clustered: false,
        lastModified: '2024-01-15'
      },
      {
        tableName: 'transactions',
        datasetId: 'finance',
        projectId: 'ecommerce-prod',
        sizeGB: 128.3,
        partitioned: true,
        clustered: true,
        lastModified: '2024-01-14'
      },
      {
        tableName: 'product_catalog',
        datasetId: 'inventory',
        projectId: 'ecommerce-prod',
        sizeGB: 45.2,
        partitioned: false,
        clustered: false,
        lastModified: '2024-01-10'
      }
    ]);
    
    // Initialize dashboard stats
    await dashboardStats.update({
      totalQueries: 0,
      totalSavings: 0,
      avgOptimizationTime: 0,
      topIssues: [],
      recentActivity: []
    });
  }
}

// Export the database instance
export default db;