import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  FiCopy, 
  FiCheck, 
  FiAlertCircle, 
  FiDatabase,
  FiZap,
  FiCode,
  FiBookOpen,
  FiArrowRight
} from 'react-icons/fi';
import toast from 'react-hot-toast';

const Help = () => {
  const [copiedIndex, setCopiedIndex] = useState(null);

  const handleCopy = (query, index) => {
    navigator.clipboard.writeText(query);
    setCopiedIndex(index);
    toast.success('Query copied to clipboard!');
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const sampleQueries = [
    {
      title: "Cross-Dataset Join Anti-Pattern",
      dataset: "Bitcoin Transactions, Blocks & StackOverflow Posts",
      description: "Demonstrates excessive cross-product joins across unrelated datasets",
      query: `SELECT *
FROM \`bigquery-public-data.crypto_bitcoin.transactions\` t1,
     \`bigquery-public-data.crypto_bitcoin.blocks\` t2,
     \`bigquery-public-data.stackoverflow.posts_questions\` t3
LIMIT 1000000;`,
      antiPatterns: ["SELECT *", "Cross-join without conditions", "Unrelated datasets"]
    },
    {
      title: "GitHub Commits Self-Join",
      dataset: "GitHub Repository Commits",
      description: "Shows inefficient self-join with CROSS JOIN and random filtering",
      query: `-- ANTI-PATTERN: SELECT *, self-join without proper conditions, no partitioning
SELECT *
FROM \`bigquery-public-data.github_repos.commits\` a
CROSS JOIN \`bigquery-public-data.github_repos.commits\` b
WHERE RAND() < 0.001;`,
      antiPatterns: ["SELECT *", "CROSS JOIN", "Random filtering", "No partitioning"]
    },
    {
      title: "Complex Regex on Large Text",
      dataset: "GitHub Repository Commits",
      description: "Multiple complex regex operations on large text fields",
      query: `-- ANTI-PATTERN: Complex regex on large text fields, multiple OR conditions
SELECT *
FROM \`bigquery-public-data.github_repos.commits\`
WHERE 
  REGEXP_CONTAINS(message, r'(?i)(fix|bug|error|issue|problem|crash|fail|wrong|mistake|incorrect|broken)')
  OR REGEXP_CONTAINS(message, r'[A-Z]{10,}')
  OR REGEXP_CONTAINS(message, r'(\\w+)\\s+\\1\\s+\\1\\s+\\1')
  OR REGEXP_CONTAINS(message, r'[0-9]{3}-[0-9]{3}-[0-9]{4}')
  OR LENGTH(REGEXP_REPLACE(message, r'[^a-zA-Z]', '')) > 1000;`,
      antiPatterns: ["Complex regex", "Multiple OR conditions", "No LIMIT", "Full table scan"]
    },
    {
      title: "PyPI Complex Multi-Join",
      dataset: "PyPI Package Downloads & Metadata",
      description: "Overly complex query with multiple joins, subqueries, and cross joins",
      query: `WITH AllPythonVersions AS (
  SELECT
    DISTINCT details.python
  FROM
    \`bigquery-public-data.pypi.file_downloads\`
)
SELECT *
FROM \`bigquery-public-data.pypi.distribution_metadata\` AS meta
JOIN \`bigquery-public-data.pypi.file_downloads\` AS downloads
  ON meta.name = downloads.project
JOIN \`bigquery-public-data.pypi.simple_requests\` AS requests
  ON downloads.project = requests.project 
  AND CAST(FORMAT_DATE('%Y%m%d', DATE(downloads.timestamp)) AS INT64) = 
      CAST(FORMAT_DATE('%Y%m%d', DATE(requests.timestamp)) AS INT64) 
JOIN \`bigquery-public-data.pypi.file_downloads\` AS downloads2
  ON downloads.project = downloads2.project 
  AND DATE(downloads.timestamp) = DATE(downloads2.timestamp) 
  AND downloads.country_code <> downloads2.country_code 
CROSS JOIN AllPythonVersions
WHERE downloads.file.filename LIKE '%.whl'
  AND (
    SELECT COUNT(*)
    FROM UNNEST(meta.classifiers) c
    WHERE c LIKE 'Topic ::%'
  ) > 3
  AND downloads.country_code IN (
    SELECT country_code
    FROM \`bigquery-public-data.pypi.file_downloads\`
    WHERE DATE(timestamp) = DATE_SUB(CURRENT_DATE(), INTERVAL 730 DAY)
    GROUP BY 1
    ORDER BY COUNT(*) DESC
    LIMIT 10
  )
  AND requests.timestamp > (
    SELECT MIN(timestamp)
    FROM \`bigquery-public-data.pypi.simple_requests\`
    WHERE project = 'tensorflow'
  )
ORDER BY downloads.details.system.release DESC, requests.url DESC;`,
      antiPatterns: ["Multiple self-joins", "CROSS JOIN", "Complex date casting", "Nested subqueries", "SELECT *"]
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div>
            <div className="flex items-center space-x-3">
              <FiBookOpen className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Help & Documentation
              </h1>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Learn how to use Query Analysis and test with sample queries
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* How to Use Query Analysis */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-8"
        >
          <div className="flex items-center space-x-3 mb-4">
            <FiZap className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              How to Use Query Analysis
            </h2>
          </div>
          
          <div className="space-y-4 text-gray-600 dark:text-gray-400">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="flex space-x-3">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                    1
                  </div>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-gray-100">Paste Your Query</h3>
                  <p className="text-sm mt-1">
                    Copy your BigQuery SQL query and paste it into the analysis input field
                  </p>
                </div>
              </div>

              <div className="flex space-x-3">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                    2
                  </div>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-gray-100">Click Analyze</h3>
                  <p className="text-sm mt-1">
                    Our AI agents will analyze your query for anti-patterns and optimization opportunities
                  </p>
                </div>
              </div>

              <div className="flex space-x-3">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                    3
                  </div>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-gray-100">Review Results</h3>
                  <p className="text-sm mt-1">
                    Get optimized queries, cost analysis, and best practice recommendations
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex">
                <FiAlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300">
                    Pro Tip
                  </h3>
                  <p className="mt-1 text-sm text-blue-700 dark:text-blue-400">
                    Use the sample queries below to test the analysis features. These queries use public datasets 
                    and contain common anti-patterns that our optimizer can detect and fix.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Sample Queries Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center space-x-3 mb-6">
            <FiCode className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Sample Queries for Testing
            </h2>
          </div>

          <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800 mb-6">
            <div className="flex">
              <FiDatabase className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Note: Public Datasets
                </h3>
                <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                  These queries use BigQuery public datasets for testing. No authentication required - 
                  just copy and paste into Query Analysis to see optimization in action.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-6">
            {sampleQueries.map((sample, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * (index + 1) }}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden"
              >
                <div className="p-6">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {sample.title}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        <span className="font-medium">Dataset:</span> {sample.dataset}
                      </p>
                    </div>
                    <button
                      onClick={() => handleCopy(sample.query, index)}
                      className="flex items-center space-x-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                      {copiedIndex === index ? (
                        <>
                          <FiCheck className="h-4 w-4" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <FiCopy className="h-4 w-4" />
                          <span>Copy Query</span>
                        </>
                      )}
                    </button>
                  </div>

                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    {sample.description}
                  </p>

                  {/* Anti-patterns badges */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {sample.antiPatterns.map((pattern, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300"
                      >
                        {pattern}
                      </span>
                    ))}
                  </div>

                  {/* Query Code Block */}
                  <div className="relative">
                    <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 p-4 rounded-lg overflow-x-auto">
                      <code className="text-sm font-mono">{sample.query}</code>
                    </pre>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Call to Action */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-8 text-center"
          >
            <a
              href="/analysis"
              className="inline-flex items-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              <span>Try Query Analysis Now</span>
              <FiArrowRight className="h-4 w-4" />
            </a>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};

export default Help;