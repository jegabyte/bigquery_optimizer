import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowRight, FiTrendingUp, FiAlertCircle, FiDollarSign, FiClock, FiDatabase, FiActivity, FiZap } from 'react-icons/fi';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { dashboardApiService } from '../services/dashboardApiService';
import { projectsApiService } from '../services/projectsApiService';

const Dashboard = () => {
  const [dashboardData, setDashboardData] = useState({
    stats: {
      total_projects: 0,
      total_templates: 0,
      total_query_runs: 0,
      total_tb_processed: 0,
      avg_runtime_seconds: 0,
      total_cost_estimate: 0
    },
    recent_templates: [],
    top_cost_drivers: []
  });
  const [projectList, setProjectList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Load real BigQuery data
      const [dashStats, projectsData] = await Promise.all([
        dashboardApiService.getDashboardStats(),
        projectsApiService.getProjects()
      ]);
      
      setDashboardData(dashStats);
      setProjectList(projectsData);
      
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
      label: 'Total Projects', 
      value: dashboardData.stats.total_projects.toString(), 
      icon: FiDatabase, 
      color: 'text-green-600', 
      bgColor: 'bg-green-100' 
    },
    { 
      label: 'Query Templates', 
      value: dashboardData.stats.total_templates.toString(), 
      icon: FiActivity, 
      color: 'text-blue-600', 
      bgColor: 'bg-blue-100' 
    },
    { 
      label: 'Total Query Runs', 
      value: dashboardData.stats.total_query_runs.toLocaleString(), 
      icon: FiZap, 
      color: 'text-purple-600', 
      bgColor: 'bg-purple-100' 
    },
    { 
      label: 'Estimated Cost', 
      value: `$${dashboardData.stats.total_cost_estimate.toFixed(2)}`, 
      icon: FiDollarSign, 
      color: 'text-yellow-600', 
      bgColor: 'bg-yellow-100' 
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Query Templates</h2>
            <Link to="/projects" className="text-primary-600 hover:text-primary-700 text-sm font-medium">
              View All <FiArrowRight className="inline ml-1" />
            </Link>
          </div>
          <div className="space-y-3">
            {dashboardData.recent_templates.length === 0 ? (
              <p className="text-sm text-gray-500">No query templates found.</p>
            ) : (
              dashboardData.recent_templates.slice(0, 5).map((template) => (
                <div key={template.template_id} className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm font-mono text-gray-800 truncate">{template.sql_snippet || template.sql_pattern?.substring(0, 100) || 'N/A'}</p>
                  <div className="flex justify-between mt-2 text-xs text-gray-600">
                    <span>{template.total_runs || 0} runs</span>
                    <span>{(template.gb_processed || template.total_bytes_processed / 1e9 || 0).toFixed(2)} GB</span>
                    <span>{template.last_seen ? new Date(template.last_seen).toLocaleDateString() : 'N/A'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Top Cost Drivers</h2>
            <Link to="/projects" className="text-primary-600 hover:text-primary-700 text-sm font-medium">
              Optimize <FiArrowRight className="inline ml-1" />
            </Link>
          </div>
          <div className="space-y-3">
            {dashboardData.top_cost_drivers.length === 0 ? (
              <p className="text-sm text-gray-500">No cost analysis available.</p>
            ) : (
              dashboardData.top_cost_drivers.map((driver) => (
                <div key={driver.template_id} className="p-3 bg-red-50 rounded-lg">
                  <p className="text-sm font-mono text-gray-800 truncate">{driver.sql_snippet || driver.sql_pattern?.substring(0, 100) || 'N/A'}</p>
                  <div className="flex justify-between mt-2">
                    <span className="text-xs text-gray-600">{driver.total_runs || 0} runs</span>
                    <span className="text-sm font-semibold text-red-600">
                      ${(driver.estimated_cost || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="mt-1">
                    <span className="text-xs text-gray-500">
                      {(driver.tb_processed || driver.total_bytes_processed / 1e12 || 0).toFixed(3)} TB processed
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;