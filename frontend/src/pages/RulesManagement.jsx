import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiFilter,
  FiCheckCircle,
  FiAlertTriangle,
  FiInfo,
  FiXCircle,
  FiCopy,
  FiSave,
  FiX
} from 'react-icons/fi';
import { rulesService } from '../services/rulesService';
import toast from 'react-hot-toast';
import MonacoEditor from '@monaco-editor/react';

const RulesManagement = () => {
  const [rules, setRules] = useState([]);
  const [filteredRules, setFilteredRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSeverity, setSelectedSeverity] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [categories, setCategories] = useState([]);

  // Form state for add/edit
  const [formData, setFormData] = useState({
    id: '',
    title: '',
    severity: 'warning',
    category: 'General',
    enabled: true,
    detect: '',
    fix: '',
    examples: {
      bad: [],
      good: []
    }
  });

  useEffect(() => {
    fetchRules();
  }, []);

  useEffect(() => {
    filterRules();
  }, [rules, searchQuery, selectedCategory, selectedSeverity]);

  const fetchRules = async () => {
    try {
      setLoading(true);
      const rulesData = await rulesService.getAllRules();
      
      const categoriesSet = new Set();
      rulesData.forEach(rule => {
        if (rule.category) {
          categoriesSet.add(rule.category);
        }
      });
      
      // Sort rules by order or alphabetically
      rulesData.sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) {
          return a.order - b.order;
        }
        return a.title.localeCompare(b.title);
      });
      
      setRules(rulesData);
      setCategories(Array.from(categoriesSet).sort());
      setLoading(false);
    } catch (error) {
      console.error('Error fetching rules:', error);
      toast.error('Failed to load rules');
      setLoading(false);
    }
  };

  const filterRules = () => {
    let filtered = [...rules];
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(rule =>
        rule.title.toLowerCase().includes(query) ||
        rule.id.toLowerCase().includes(query) ||
        rule.detect.toLowerCase().includes(query) ||
        rule.fix.toLowerCase().includes(query)
      );
    }
    
    // Category filter removed - not needed
    
    // Severity filter
    if (selectedSeverity !== 'all') {
      filtered = filtered.filter(rule => rule.severity === selectedSeverity);
    }
    
    setFilteredRules(filtered);
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'error':
        return <FiXCircle className="h-5 w-5 text-red-500" />;
      case 'warning':
        return <FiAlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'info':
        return <FiInfo className="h-5 w-5 text-blue-500" />;
      default:
        return <FiInfo className="h-5 w-5 text-gray-500" />;
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'error':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      case 'warning':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'info':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const handleAddRule = async () => {
    try {
      if (!formData.id || !formData.title || !formData.detect || !formData.fix) {
        toast.error('Please fill in all required fields');
        return;
      }
      
      const newRule = {
        ...formData,
        order: rules.length
      };
      
      await rulesService.addRule(newRule);
      toast.success('Rule added successfully');
      setShowAddModal(false);
      resetForm();
      fetchRules();
    } catch (error) {
      console.error('Error adding rule:', error);
      toast.error('Failed to add rule');
    }
  };

  const handleUpdateRule = async () => {
    try {
      if (!formData.id || !formData.title || !formData.detect || !formData.fix) {
        toast.error('Please fill in all required fields');
        return;
      }
      
      await rulesService.updateRule(editingRule.docId || editingRule.id, formData);
      
      toast.success('Rule updated successfully');
      setShowEditModal(false);
      resetForm();
      fetchRules();
    } catch (error) {
      console.error('Error updating rule:', error);
      toast.error('Failed to update rule');
    }
  };

  const handleDeleteRule = async (rule) => {
    if (!confirm(`Are you sure you want to delete the rule "${rule.title}"?`)) {
      return;
    }
    
    try {
      await rulesService.deleteRule(rule.docId || rule.id);
      toast.success('Rule deleted successfully');
      fetchRules();
    } catch (error) {
      console.error('Error deleting rule:', error);
      toast.error('Failed to delete rule');
    }
  };

  const handleToggleRule = async (rule) => {
    try {
      await rulesService.toggleRule(rule.docId || rule.id, !rule.enabled);
      
      toast.success(`Rule ${!rule.enabled ? 'enabled' : 'disabled'}`);
      fetchRules();
    } catch (error) {
      console.error('Error toggling rule:', error);
      toast.error('Failed to toggle rule');
    }
  };

  const resetForm = () => {
    setFormData({
      id: '',
      title: '',
      severity: 'warning',
      category: 'General',
      enabled: true,
      detect: '',
      fix: '',
      examples: {
        bad: [],
        good: []
      }
    });
    setEditingRule(null);
  };

  const openEditModal = (rule) => {
    setEditingRule(rule);
    setFormData({
      id: rule.id,
      title: rule.title,
      severity: rule.severity,
      category: rule.category || 'General',
      enabled: rule.enabled,
      detect: rule.detect,
      fix: rule.fix,
      examples: rule.examples || { bad: [], good: [] }
    });
    setShowEditModal(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                BigQuery Anti-Pattern Rules
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Manage rules for query optimization and best practices
              </p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
            >
              <FiPlus className="h-5 w-5" />
              <span>Add Rule</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search rules..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            {/* Severity Filter */}
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Severities</option>
              <option value="error">Error</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>

            {/* Stats */}
            <div className="flex items-center justify-end space-x-4 text-sm text-gray-600 dark:text-gray-400">
              <span>Total: {filteredRules.length} rules</span>
              <span>Active: {filteredRules.filter(r => r.enabled).length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Rules List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6">
        <div className="space-y-4">
          {filteredRules.map((rule) => (
            <motion.div
              key={rule.docId || rule.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    {getSeverityIcon(rule.severity)}
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {rule.title}
                    </h3>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(rule.severity)}`}>
                      {rule.severity}
                    </span>
                  </div>
                  
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 font-mono">
                    ID: {rule.id}
                  </p>

                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Detection Pattern:
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {rule.detect}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Recommended Fix:
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {rule.fix}
                      </p>
                    </div>

                    {rule.examples && (rule.examples.bad?.length > 0 || rule.examples.good?.length > 0) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        {rule.examples.bad?.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">
                              Bad Examples:
                            </p>
                            <div className="space-y-1">
                              {rule.examples.bad.map((example, idx) => (
                                <pre key={idx} className="text-xs bg-red-50 dark:bg-red-900/20 p-2 rounded overflow-x-auto">
                                  <code>{example}</code>
                                </pre>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {rule.examples.good?.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-green-600 dark:text-green-400 mb-2">
                              Good Examples:
                            </p>
                            <div className="space-y-1">
                              {rule.examples.good.map((example, idx) => (
                                <pre key={idx} className="text-xs bg-green-50 dark:bg-green-900/20 p-2 rounded overflow-x-auto">
                                  <code>{example}</code>
                                </pre>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-3 ml-4">
                  {/* Toggle Switch */}
                  <div className="flex flex-col items-center">
                    <button
                      onClick={() => handleToggleRule(rule)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        rule.enabled 
                          ? 'bg-green-500 hover:bg-green-600' 
                          : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'
                      }`}
                      title={rule.enabled ? 'Click to disable' : 'Click to enable'}
                    >
                      <span className="sr-only">{rule.enabled ? 'Disable' : 'Enable'} rule</span>
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          rule.enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <span className={`text-xs mt-1 font-medium ${
                      rule.enabled 
                        ? 'text-green-600 dark:text-green-400' 
                        : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      {rule.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <button
                    onClick={() => openEditModal(rule)}
                    className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    title="Edit"
                  >
                    <FiEdit2 className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => handleDeleteRule(rule)}
                    className="p-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    title="Delete"
                  >
                    <FiTrash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {filteredRules.length === 0 && (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg">
            <p className="text-gray-500 dark:text-gray-400">
              No rules found matching your criteria
            </p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {(showAddModal || showEditModal) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
            onClick={() => {
              setShowAddModal(false);
              setShowEditModal(false);
              resetForm();
            }}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  {showAddModal ? 'Add New Rule' : 'Edit Rule'}
                </h2>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Rule ID *
                    </label>
                    <input
                      type="text"
                      value={formData.id}
                      onChange={(e) => setFormData({ ...formData, id: e.target.value.toUpperCase().replace(/\s+/g, '_') })}
                      disabled={showEditModal}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:opacity-50"
                      placeholder="e.g., MISSING_WHERE_CLAUSE"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Title *
                    </label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      placeholder="e.g., Missing WHERE clause"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Severity *
                    </label>
                    <select
                      value={formData.severity}
                      onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="error">Error</option>
                      <option value="warning">Warning</option>
                      <option value="info">Info</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Category
                    </label>
                    <input
                      type="text"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      placeholder="e.g., Query Structure"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Detection Pattern *
                  </label>
                  <textarea
                    value={formData.detect}
                    onChange={(e) => setFormData({ ...formData, detect: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder="Describe how to detect this anti-pattern..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Recommended Fix *
                  </label>
                  <textarea
                    value={formData.fix}
                    onChange={(e) => setFormData({ ...formData, fix: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder="Describe how to fix this anti-pattern..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Bad Examples (one per line)
                    </label>
                    <textarea
                      value={formData.examples.bad?.join('\n') || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        examples: {
                          ...formData.examples,
                          bad: e.target.value.split('\n').filter(line => line.trim())
                        }
                      })}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-sm"
                      placeholder="SELECT * FROM table"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Good Examples (one per line)
                    </label>
                    <textarea
                      value={formData.examples.good?.join('\n') || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        examples: {
                          ...formData.examples,
                          good: e.target.value.split('\n').filter(line => line.trim())
                        }
                      })}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-sm"
                      placeholder="SELECT id, name FROM table"
                    />
                  </div>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="enabled"
                    checked={formData.enabled}
                    onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="enabled" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    Rule is enabled
                  </label>
                </div>
              </div>

              <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setShowEditModal(false);
                    resetForm();
                  }}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={showAddModal ? handleAddRule : handleUpdateRule}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
                >
                  <FiSave className="h-5 w-5" />
                  <span>{showAddModal ? 'Add Rule' : 'Update Rule'}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RulesManagement;