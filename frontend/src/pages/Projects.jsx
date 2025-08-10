import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  FiPlus, 
  FiRefreshCw,
  FiBarChart2,
  FiDollarSign,
  FiActivity,
  FiCheckCircle,
  FiAlertTriangle
} from 'react-icons/fi';
import ProjectCard from '../components/projects/ProjectCard';
import ProjectDetailView from '../components/projects/ProjectDetailView';
import ProjectOnboarding from '../components/projects/ProjectOnboarding';
import { formatCost } from '../services/projectsMockData';
import { projectsApiService } from '../services/projectsApiService';

const Projects = () => {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch projects on component mount
  useEffect(() => {
    const fetchProjects = async () => {
      setIsLoading(true);
      try {
        const data = await projectsApiService.getProjects();
        setProjects(data);
      } catch (error) {
        console.error('Failed to fetch projects:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProjects();
  }, []);

  const handleSelectProject = (project) => {
    setSelectedProject(project);
  };

  const handleBackToProjects = () => {
    setSelectedProject(null);
  };

  const handleRefreshProject = async (projectId) => {
    setIsLoading(true);
    try {
      await projectsApiService.refreshProject(projectId);
      // Refresh the projects list
      const data = await projectsApiService.getProjects();
      setProjects(data);
      // Update selected project if it's the one being refreshed
      if (selectedProject?.id === projectId) {
        const updatedProject = data.find(p => p.id === projectId);
        setSelectedProject(updatedProject);
      }
    } catch (error) {
      console.error('Failed to refresh project:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditProject = (projectId) => {
    console.log('Edit project:', projectId);
    // TODO: Open edit modal
  };

  const handleRemoveProject = (projectId) => {
    if (confirm('Are you sure you want to remove this project integration?')) {
      setProjects(projects.filter(p => p.id !== projectId));
      if (selectedProject?.id === projectId) {
        setSelectedProject(null);
      }
    }
  };

  const handlePauseProject = (projectId) => {
    console.log('Pause project:', projectId);
    // TODO: Implement pause functionality
  };

  const handleOnboardingComplete = (newProject) => {
    console.log('New project:', newProject);
    // Add new project to the list
    const project = {
      id: `proj-${Date.now()}`,
      ...newProject,
      lastUpdated: new Date(),
      stats: {
        templatesDiscovered: 0,
        totalRuns: 0,
        estimatedMonthlySpend: 0,
        potentialSavings: 0,
        complianceScore: 0
      },
      topCostDrivers: []
    };
    setProjects([...projects, project]);
    setIsOnboardingOpen(false);
    // Automatically select the new project
    setSelectedProject(project);
  };

  // Calculate totals
  const totals = projects.reduce((acc, project) => ({
    templates: acc.templates + project.stats.templatesDiscovered,
    runs: acc.runs + project.stats.totalRuns,
    spend: acc.spend + project.stats.estimatedMonthlySpend,
    savings: acc.savings + project.stats.potentialSavings
  }), { templates: 0, runs: 0, spend: 0, savings: 0 });

  // If a project is selected, show the detailed view
  if (selectedProject) {
    return (
      <ProjectDetailView
        project={selectedProject}
        onBack={handleBackToProjects}
        onRefresh={handleRefreshProject}
        onEdit={handleEditProject}
        onRemove={handleRemoveProject}
        onPause={handlePauseProject}
      />
    );
  }

  // Otherwise show the projects overview
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">

      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Projects & Jobs
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Bulk optimization for your BigQuery workloads
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={async () => {
                  setIsLoading(true);
                  try {
                    const data = await projectsApiService.getProjects();
                    setProjects(data);
                  } catch (error) {
                    console.error('Failed to refresh projects:', error);
                  } finally {
                    setIsLoading(false);
                  }
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 flex items-center space-x-2"
              >
                <FiRefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Refresh All</span>
              </button>
              <button
                onClick={() => setIsOnboardingOpen(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <FiPlus className="h-5 w-5" />
                <span>Add Project</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-4 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Query Templates
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">
                  {totals.templates.toLocaleString()}
                </p>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                <FiActivity className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Total Runs
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">
                  {totals.runs.toLocaleString()}
                </p>
              </div>
              <div className="p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg">
                <FiBarChart2 className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Monthly Spend
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">
                  {formatCost(totals.spend)}
                </p>
              </div>
              <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-lg">
                <FiDollarSign className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Potential Savings
                </p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-2">
                  {formatCost(totals.savings)}
                </p>
              </div>
              <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
                <FiCheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Projects Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Integrated Projects ({projects.length})
          </h2>
        </div>
        
        {projects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <div
                key={project.id}
                onClick={() => handleSelectProject(project)}
                className="cursor-pointer transition-all hover:scale-[1.02]"
              >
                <ProjectCard
                  project={project}
                  onRefresh={handleRefreshProject}
                  onEdit={handleEditProject}
                  onRemove={handleRemoveProject}
                  onPause={handlePauseProject}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <FiActivity className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">
              No projects integrated yet
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Get started by adding your first GCP project to discover and optimize query templates.
            </p>
            <button
              onClick={() => setIsOnboardingOpen(true)}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center space-x-2"
            >
              <FiPlus className="h-5 w-5" />
              <span>Add Your First Project</span>
            </button>
          </div>
        )}
      </div>

      {/* Project Onboarding Modal */}
      <ProjectOnboarding
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        onComplete={handleOnboardingComplete}
      />
    </div>
  );
};

export default Projects;