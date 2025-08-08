import React from 'react';
import { motion } from 'framer-motion';
import { FiCheck, FiLoader, FiDatabase, FiSearch, FiEdit3, FiCheckCircle } from 'react-icons/fi';

const CompactProgressStepper = ({ currentStep, steps, status }) => {
  const defaultSteps = [
    { id: 'metadata', name: 'Extracting Metadata', icon: FiDatabase },
    { id: 'analysis', name: 'Anti-Pattern Analysis', icon: FiSearch },
    { id: 'optimization', name: 'Query Optimization', icon: FiEdit3 },
    { id: 'validation', name: 'Result Validation', icon: FiCheckCircle },
  ];

  const stepsToShow = steps || defaultSteps;

  const getStepStatus = (stepIndex) => {
    // If we have a completion status, mark all as completed
    if (status === 'completed') return 'completed';
    if (status === 'failed') return stepIndex <= currentStep ? 'failed' : 'pending';
    
    if (currentStep > stepIndex) return 'completed';
    if (currentStep === stepIndex) return 'active';
    return 'pending';
  };

  return (
    <div className="space-y-3">
      {stepsToShow.map((step, index) => {
        const status = getStepStatus(index);
        const Icon = step.icon;

        return (
          <motion.div
            key={step.id}
            className="flex items-center space-x-3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            {/* Step Icon */}
            <div
              className={`
                relative flex items-center justify-center w-8 h-8 rounded-full border transition-all duration-300
                ${status === 'completed' ? 'bg-green-500 border-green-500' : ''}
                ${status === 'active' ? 'bg-primary-50 border-primary-500' : ''}
                ${status === 'pending' ? 'bg-gray-100 border-gray-300' : ''}
              `}
            >
              {status === 'completed' ? (
                <FiCheck className="w-4 h-4 text-white" />
              ) : status === 'active' ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                >
                  <FiLoader className="w-4 h-4 text-primary-600" />
                </motion.div>
              ) : (
                <Icon className={`w-4 h-4 ${status === 'pending' ? 'text-gray-400' : 'text-primary-600'}`} />
              )}
            </div>

            {/* Step Label */}
            <div className="flex-1">
              <p className={`text-sm ${
                status === 'active' ? 'font-medium text-primary-600' : 
                status === 'completed' ? 'text-gray-700' : 'text-gray-400'
              }`}>
                {step.name}
              </p>
              {status === 'active' && (
                <motion.div
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 2, ease: 'linear' }}
                  className="h-1 bg-primary-200 rounded-full mt-1 overflow-hidden"
                >
                  <motion.div
                    className="h-full bg-primary-500"
                    animate={{ x: ['0%', '100%'] }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                    style={{ width: '30%' }}
                  />
                </motion.div>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

export default CompactProgressStepper;