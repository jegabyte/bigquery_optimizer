import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowRight, FiTrendingUp, FiAlertCircle, FiDollarSign, FiClock } from 'react-icons/fi';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { projects, analyses, queryHistory, dashboardStats, initializeWithMockData } from '../services/database';
import { mockOptimizationService } from '../services/mockData';

const Dashboard = () => {
  const [projectList, setProjectList] = useState([]);
  const [recentQueries, setRecentQueries] = useState([]);
  const [stats, setStats] = useState({
    totalQueries: 0,
    totalSavings: 0,
    avgOptimizationTime: 0,
    topIssues: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Initialize with mock data if empty
      await initializeWithMockData();
      
      // Load projects
      const projectsData = await projects.getAll();
      setProjectList(projectsData);
      
      // Load analyses for recent queries
      const analysesData = await analyses.getAll();
      
      // Calculate and update dashboard stats
      const calculatedStats = await dashboardStats.calculateStats();
      await dashboardStats.update(calculatedStats);
      
      // Format recent queries for display
      const formattedQueries = analysesData.slice(0, 5).map(analysis => ({
        id: analysis.id,
        query: analysis.query || analysis.originalQuery || 'N/A',
        projectName: 'Default Project',
        issues: analysis.issues?.length || 0,
        costSavings: analysis.validationResult?.costSavings || 0,
        timestamp: new Date(analysis.createdAt).toLocaleString()
      }));
      
      setRecentQueries(formattedQueries);
      
      // Set stats for display
      setStats({
        totalQueries: calculatedStats.totalQueries,
        issuesFound: analysesData.reduce((sum, a) => sum + (a.issues?.length || 0), 0),
        avgCostSavings: calculatedStats.totalQueries > 0 
          ? (calculatedStats.totalSavings / calculatedStats.totalQueries).toFixed(1)
          : 0,
        avgProcessingTime: calculatedStats.avgOptimizationTime.toFixed(1)
      });
      
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const performanceData = [
    { date: 'Mon', queries: 12, optimized: 10 },
    { date: 'Tue', queries: 15, optimized: 13 },
    { date: 'Wed', queries: 18, optimized: 16 },
    { date: 'Thu', queries: 14, optimized: 12 },
    { date: 'Fri', queries: 20, optimized: 18 },
    { date: 'Sat', queries: 8, optimized: 7 },
    { date: 'Sun', queries: 10, optimized: 9 },
  ];

  const statsDisplay = [
    { 
      label: 'Total Queries', 
      value: stats.totalQueries.toString(), 
      icon: FiTrendingUp, 
      color: 'text-green-600', 
      bgColor: 'bg-green-100' 
    },
    { 
      label: 'Issues Found', 
      value: stats.issuesFound?.toString() || '0', 
      icon: FiAlertCircle, 
      color: 'text-yellow-600', 
      bgColor: 'bg-yellow-100' 
    },
    { 
      label: 'Avg Cost Savings', 
      value: `${stats.avgCostSavings}%`, 
      icon: FiDollarSign, 
      color: 'text-blue-600', 
      bgColor: 'bg-blue-100' 
    },
    { 
      label: 'Avg Processing Time', 
      value: `${stats.avgProcessingTime}s`, 
      icon: FiClock, 
      color: 'text-purple-600', 
      bgColor: 'bg-purple-100' 
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">Monitor your BigQuery optimization performance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statsDisplay.map((stat, index) => (
          <div key={index} className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
              </div>
              <div className={`${stat.bgColor} p-3 rounded-lg`}>
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Query Optimization Trend</h2>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={performanceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" stroke="#6b7280" />
              <YAxis stroke="#6b7280" />
              <Tooltip />
              <Area type="monotone" dataKey="queries" stackId="1" stroke="#3b82f6" fill="#93c5fd" />
              <Area type="monotone" dataKey="optimized" stackId="2" stroke="#10b981" fill="#86efac" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Active Projects</h2>
            <Link to="/query-analysis" className="text-primary-600 hover:text-primary-700 text-sm font-medium">
              View All <FiArrowRight className="inline ml-1" />
            </Link>
          </div>
          <div className="space-y-3">
            {projectList.length === 0 ? (
              <p className="text-sm text-gray-500">No projects yet. Start by analyzing a query.</p>
            ) : (
              projectList.slice(0, 3).map((project) => (
                <div key={project.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <div>
                    <p className="font-medium text-gray-900">{project.name}</p>
                    <p className="text-sm text-gray-600">Project ID: {project.projectId}</p>
                  </div>
                  <span className="text-xs text-gray-500">Created: {new Date(project.createdAt).toLocaleDateString()}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Recent Query Analysis</h2>
          <Link to="/query-analysis" className="text-primary-600 hover:text-primary-700 text-sm font-medium">
            Analyze New Query <FiArrowRight className="inline ml-1" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          {recentQueries.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No queries analyzed yet. Start by analyzing a query.</p>
          ) : (
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Query</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Project</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Issues</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Cost Savings</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Time</th>
                </tr>
              </thead>
              <tbody>
                {recentQueries.map((query) => (
                  <tr key={query.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm text-gray-900 font-mono max-w-xs truncate">
                      {query.query}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">{query.projectName}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        query.issues === 0 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {query.issues} issues
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900">
                      {query.costSavings > 0 ? `${query.costSavings.toFixed(0)}%` : '-'}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500">{query.timestamp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;