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
import toast from 'react-hot-toast';

const Projects = () => {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // Start with loading true
  const [isRefreshing, setIsRefreshing] = useState(false);

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
    setIsRefreshing(true);
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
      setIsRefreshing(false);
    }
  };

  const handleEditProject = (projectId) => {
    console.log('Edit project:', projectId);
    // TODO: Open edit modal
  };

  const handleRemoveProject = async (projectId) => {
    if (confirm('Are you sure you want to remove this project? This will delete all associated templates and analyses.')) {
      const loadingToast = toast.loading('Deleting project...');
      
      try {
        const response = await fetch(`${import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8001'}/api/projects/${projectId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          }
        });
        
        if (!response.ok) {
          throw new Error('Failed to delete project');
        }
        
        const result = await response.json();
        
        toast.dismiss(loadingToast);
        toast.success('Project deleted successfully');
        
        // Update local state - check all possible ID fields
        setProjects(projects.filter(p => p.projectId !== projectId && p.project_id !== projectId && p.id !== projectId));
        if (selectedProject?.projectId === projectId || selectedProject?.project_id === projectId || selectedProject?.id === projectId) {
          setSelectedProject(null);
        }
        
        // Refresh projects list
        const data = await projectsApiService.getProjects();
        setProjects(data);
      } catch (error) {
        toast.dismiss(loadingToast);
        toast.error('Failed to delete project: ' + error.message);
        console.error('Delete project error:', error);
      }
    }
  };

  const handlePauseProject = (projectId) => {
    console.log('Pause project:', projectId);
    // TODO: Implement pause functionality
  };

  const handleOnboardingComplete = async (newProject) => {
    console.log('New project configuration:', newProject);
    
    // The project is already created by ProjectOnboarding component
    // Refresh the projects list
    try {
      const data = await projectsApiService.getProjects();
      setProjects(data);
      setIsOnboardingOpen(false);
      
      // If this is called after background scan completes, refresh again
      if (newProject?.refresh) {
        setTimeout(async () => {
          try {
            const refreshedData = await projectsApiService.getProjects();
            setProjects(refreshedData);
          } catch (error) {
            console.error('Failed to refresh after scan:', error);
          }
        }, 1000);
      }
    } catch (error) {
      console.error('Failed to refresh projects:', error);
      setIsOnboardingOpen(false);
    }
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Project Analysis
              </h1>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Analyze all queries in the project using INFORMATION_SCHEMA.JOBS_BY_PROJECT
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={async () => {
                  setIsRefreshing(true);
                  try {
                    const data = await projectsApiService.getProjects();
                    setProjects(data);
                  } catch (error) {
                    console.error('Failed to refresh projects:', error);
                  } finally {
                    setIsRefreshing(false);
                  }
                }}
                className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 flex items-center space-x-1.5"
              >
                <FiRefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>Refresh All</span>
              </button>
              <button
                onClick={() => setIsOnboardingOpen(true)}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-1.5"
              >
                <FiPlus className="h-4 w-4" />
                <span>Add Project</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="grid grid-cols-4 gap-3">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Query Templates
                </p>
                {isLoading ? (
                  <div className="h-7 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mt-1"></div>
                ) : (
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                    {totals.templates.toLocaleString()}
                  </p>
                )}
              </div>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                <FiActivity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Total Runs
                </p>
                {isLoading ? (
                  <div className="h-7 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mt-1"></div>
                ) : (
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                    {totals.runs.toLocaleString()}
                  </p>
                )}
              </div>
              <div className="p-2 bg-purple-50 dark:bg-purple-950/30 rounded-lg">
                <FiBarChart2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Monthly Spend
                </p>
                {isLoading ? (
                  <div className="h-7 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mt-1"></div>
                ) : (
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                    {formatCost(totals.spend)}
                  </p>
                )}
              </div>
              <div className="p-2 bg-red-50 dark:bg-red-950/30 rounded-lg">
                <FiDollarSign className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Potential Savings
                </p>
                {isLoading ? (
                  <div className="h-7 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mt-1"></div>
                ) : (
                  <p className="text-xl font-bold text-green-600 dark:text-green-400 mt-1">
                    {formatCost(totals.savings)}
                  </p>
                )}
              </div>
              <div className="p-2 bg-green-50 dark:bg-green-950/30 rounded-lg">
                <FiCheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Projects Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-4">
        <div className="mb-3">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Analyzed Projects ({projects.length})
          </h2>
        </div>
        
        {isLoading ? (
          // Loading state with animation
          <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex flex-col items-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400"></div>
              <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                Loading projects...
              </p>
            </div>
          </div>
        ) : projects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
          <div className="text-center py-8 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <FiActivity className="mx-auto h-10 w-10 text-gray-400" />
            <h3 className="mt-3 text-base font-medium text-gray-900 dark:text-gray-100">
              No projects analyzed yet
            </h3>
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              Get started by adding your first GCP project to discover and optimize query templates.
            </p>
            <button
              onClick={() => setIsOnboardingOpen(true)}
              className="mt-3 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center space-x-1.5"
            >
              <FiPlus className="h-4 w-4" />
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