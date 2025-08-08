import React from 'react';
import { useQuery } from 'react-query';
import axios from 'axios';
import { FiDatabase, FiLayers, FiGrid, FiAlertCircle, FiCheckCircle } from 'react-icons/fi';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const StorageInsights = () => {
  const { data: insights, isLoading } = useQuery('storageInsights', () =>
    axios.get('/api/storage-insights').then(res => res.data)
  );

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  const pieData = insights?.tables?.map((table, index) => ({
    name: table.name,
    value: parseFloat(table.size.replace(/[^\d.]/g, '')),
  })) || [];

  const getStatusIcon = (partitioned, clustered) => {
    if (partitioned && clustered) {
      return <FiCheckCircle className="text-green-500" />;
    } else if (partitioned || clustered) {
      return <FiAlertCircle className="text-yellow-500" />;
    }
    return <FiAlertCircle className="text-red-500" />;
  };

  const getStatusColor = (partitioned, clustered) => {
    if (partitioned && clustered) {
      return 'bg-green-50 border-green-200';
    } else if (partitioned || clustered) {
      return 'bg-yellow-50 border-yellow-200';
    }
    return 'bg-red-50 border-red-200';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Storage Insights</h1>
        <p className="mt-2 text-gray-600">Analyze and optimize your BigQuery table storage</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <div className="flex items-center space-x-3">
            <div className="bg-primary-100 p-3 rounded-lg">
              <FiDatabase className="h-6 w-6 text-primary-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Storage</p>
              <p className="text-2xl font-bold text-gray-900">{insights?.totalSize}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center space-x-3">
            <div className="bg-green-100 p-3 rounded-lg">
              <FiLayers className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Tables Analyzed</p>
              <p className="text-2xl font-bold text-gray-900">{insights?.tables?.length || 0}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-100 p-3 rounded-lg">
              <FiGrid className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Potential Savings</p>
              <p className="text-2xl font-bold text-gray-900">{insights?.potentialSavings}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Table Analysis</h2>
          <div className="space-y-4">
            {insights?.tables?.map((table, index) => (
              <div key={index} className={`p-4 border rounded-lg ${getStatusColor(table.partitioned, table.clustered)}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(table.partitioned, table.clustered)}
                      <h3 className="font-medium text-gray-900">{table.name}</h3>
                      <span className="text-sm text-gray-500">({table.size})</span>
                    </div>
                    
                    <div className="mt-2 flex space-x-4">
                      <div className="flex items-center space-x-1">
                        <span className="text-sm text-gray-600">Partitioned:</span>
                        <span className={`text-sm font-medium ${table.partitioned ? 'text-green-600' : 'text-red-600'}`}>
                          {table.partitioned ? 'Yes' : 'No'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <span className="text-sm text-gray-600">Clustered:</span>
                        <span className={`text-sm font-medium ${table.clustered ? 'text-green-600' : 'text-red-600'}`}>
                          {table.clustered ? 'Yes' : 'No'}
                        </span>
                      </div>
                    </div>

                    {table.recommendation && (
                      <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200">
                        <p className="text-sm font-medium text-gray-700 mb-1">Recommendation:</p>
                        <p className="text-sm text-gray-600">{table.recommendation}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Storage Distribution</h2>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>

          <div className="mt-4 space-y-2">
            {pieData.map((entry, index) => (
              <div key={index} className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  ></div>
                  <span className="text-gray-600">{entry.name}</span>
                </div>
                <span className="font-medium text-gray-900">{entry.value} TB</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card bg-gradient-to-r from-primary-50 to-blue-50 border-primary-200">
        <div className="flex items-start space-x-4">
          <div className="bg-white p-3 rounded-lg shadow-sm">
            <FiAlertCircle className="h-6 w-6 text-primary-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Optimization Tips</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start">
                <span className="text-primary-600 mr-2">•</span>
                Consider partitioning large tables by date or timestamp columns to reduce query costs
              </li>
              <li className="flex items-start">
                <span className="text-primary-600 mr-2">•</span>
                Add clustering on frequently filtered columns to improve query performance
              </li>
              <li className="flex items-start">
                <span className="text-primary-600 mr-2">•</span>
                Remove or archive unused tables to reduce storage costs
              </li>
              <li className="flex items-start">
                <span className="text-primary-600 mr-2">•</span>
                Use table expiration for temporary or staging tables
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StorageInsights;