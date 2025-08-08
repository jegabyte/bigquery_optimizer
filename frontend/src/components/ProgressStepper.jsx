import React from 'react';
import { motion } from 'framer-motion';
import { FiCheck, FiLoader, FiDatabase, FiSearch, FiEdit3, FiCheckCircle } from 'react-icons/fi';

const ProgressStepper = ({ currentStep, steps }) => {
  const defaultSteps = [
    { id: 'metadata', name: 'Extracting Metadata', icon: FiDatabase, description: 'Analyzing table schemas and structure' },
    { id: 'analysis', name: 'Anti-Pattern Analysis', icon: FiSearch, description: 'Checking against optimization rules' },
    { id: 'optimization', name: 'Query Optimization', icon: FiEdit3, description: 'Generating optimized SQL' },
    { id: 'validation', name: 'Result Validation', icon: FiCheckCircle, description: 'Comparing results and costs' },
  ];

  const stepsToShow = steps || defaultSteps;

  const getStepStatus = (stepIndex) => {
    if (currentStep > stepIndex) return 'completed';
    if (currentStep === stepIndex) return 'active';
    return 'pending';
  };

  return (
    <div className="w-full py-6">
      <div className="relative">
        {/* Progress Line */}
        <div className="absolute top-8 left-8 right-8 h-0.5 bg-gray-200">
          <motion.div
            className="h-full bg-primary-600"
            initial={{ width: '0%' }}
            animate={{ width: `${(currentStep / (stepsToShow.length - 1)) * 100}%` }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          />
        </div>

        {/* Steps */}
        <div className="relative flex justify-between">
          {stepsToShow.map((step, index) => {
            const status = getStepStatus(index);
            const Icon = step.icon;

            return (
              <motion.div
                key={step.id}
                className="flex flex-col items-center"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                {/* Step Circle */}
                <motion.div
                  className={`
                    relative z-10 flex items-center justify-center w-16 h-16 rounded-full border-2 transition-all duration-300
                    ${status === 'completed' ? 'bg-primary-600 border-primary-600' : ''}
                    ${status === 'active' ? 'bg-white border-primary-600 shadow-lg' : ''}
                    ${status === 'pending' ? 'bg-white border-gray-300' : ''}
                  `}
                  animate={status === 'active' ? { scale: [1, 1.1, 1] } : {}}
                  transition={{ repeat: status === 'active' ? Infinity : 0, duration: 2 }}
                >
                  {status === 'completed' ? (
                    <FiCheck className="w-6 h-6 text-white" />
                  ) : status === 'active' ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                    >
                      <FiLoader className="w-6 h-6 text-primary-600" />
                    </motion.div>
                  ) : (
                    <Icon className={`w-6 h-6 ${status === 'pending' ? 'text-gray-400' : 'text-primary-600'}`} />
                  )}
                </motion.div>

                {/* Step Label */}
                <div className="mt-3 text-center">
                  <p className={`text-sm font-medium ${
                    status === 'active' ? 'text-primary-600' : 
                    status === 'completed' ? 'text-gray-900' : 'text-gray-500'
                  }`}>
                    {step.name}
                  </p>
                  <p className="text-xs text-gray-500 mt-1 max-w-[120px]">
                    {step.description}
                  </p>
                </div>

                {/* Active Step Indicator */}
                {status === 'active' && (
                  <motion.div
                    className="absolute -bottom-8 left-1/2 transform -translate-x-1/2"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className="bg-primary-600 text-white text-xs px-2 py-1 rounded-full">
                      Processing...
                    </div>
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ProgressStepper;