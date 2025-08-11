/**
 * Service for managing BigQuery anti-pattern rules
 * This service interacts with the backend API to manage rules stored in Firestore
 */

const API_BASE_URL = 'http://localhost:8001';

export const rulesService = {
  /**
   * Fetch all rules from the backend
   */
  async getAllRules() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rules`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch rules');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching rules:', error);
      // Return mock data for now
      return this.getMockRules();
    }
  },

  /**
   * Add a new rule
   */
  async addRule(rule) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(rule),
      });
      
      if (!response.ok) {
        throw new Error('Failed to add rule');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error adding rule:', error);
      throw error;
    }
  },

  /**
   * Update an existing rule
   */
  async updateRule(ruleId, updates) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rules/${ruleId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update rule');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error updating rule:', error);
      throw error;
    }
  },

  /**
   * Delete a rule
   */
  async deleteRule(ruleId) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rules/${ruleId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete rule');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error deleting rule:', error);
      throw error;
    }
  },

  /**
   * Toggle rule enabled/disabled status
   */
  async toggleRule(ruleId, enabled) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rules/${ruleId}/toggle`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(enabled),
      });
      
      if (!response.ok) {
        throw new Error('Failed to toggle rule');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error toggling rule:', error);
      throw error;
    }
  },

  /**
   * Get mock rules for development - All 22 rules from bq_anti_patterns.yaml
   */
  getMockRules() {
    return [
      {
        docId: 'NO_SELECT_STAR',
        id: 'NO_SELECT_STAR',
        title: 'Avoid SELECT *',
        severity: 'warning',
        enabled: true,
        detect: 'Flag wildcard projection (* or t.*) except COUNT(*), * EXCEPT(...), or * REPLACE(...).',
        fix: 'Select only required columns.',
        examples: {
          bad: ['SELECT * FROM `project.dataset.table`', 'SELECT t.* FROM `project.dataset.table` AS t'],
          good: ['SELECT id, dt FROM `project.dataset.table`']
        },
        order: 0
      },
      {
        docId: 'MISSING_PARTITION_FILTER',
        id: 'MISSING_PARTITION_FILTER',
        title: 'Missing partition filter',
        severity: 'error',
        enabled: true,
        detect: 'Partitioned table read without a WHERE on its partition column (or _PARTITIONTIME/_PARTITIONDATE).',
        fix: 'Add a constant/param range filter on the partition column.',
        examples: {
          bad: ['SELECT * FROM `project.dataset.events`'],
          good: ['SELECT * FROM `project.dataset.events` WHERE event_date BETWEEN @start AND @end']
        },
        order: 1
      },
      {
        docId: 'NON_CONSTANT_PARTITION_FILTER',
        id: 'NON_CONSTANT_PARTITION_FILTER',
        title: 'Non-constant partition filter',
        severity: 'warning',
        enabled: true,
        detect: 'Partition column filtered by non-constant expression (another column, subquery, or volatile func) preventing pruning.',
        fix: 'Compare partition column to constants or parameters.',
        examples: {
          bad: ['WHERE dt = (SELECT MAX(order_dt) FROM `project.dataset.orders`)'],
          good: ['WHERE dt BETWEEN "2025-08-01" AND "2025-08-31"']
        },
        order: 2
      },
      {
        docId: 'FUNCTION_ON_PARTITION_COLUMN',
        id: 'FUNCTION_ON_PARTITION_COLUMN',
        title: 'Function on partition column',
        severity: 'warning',
        enabled: true,
        detect: 'Partition column wrapped in a function/expression in WHERE disables partition pruning.',
        fix: 'Compare partition column directly to constants/params without wrapping.',
        examples: {
          bad: ['WHERE DATE(event_ts) = "2025-08-01"'],
          good: ['WHERE event_ts >= TIMESTAMP("2025-08-01") AND event_ts < TIMESTAMP("2025-08-02")']
        },
        order: 3
      },
      {
        docId: 'CLUSTER_FILTER_COMPLEX',
        id: 'CLUSTER_FILTER_COMPLEX',
        title: 'Complex filter on clustered column',
        severity: 'warning',
        enabled: true,
        detect: 'Clustered column filtered via function or compared to another column, blocking block-pruning.',
        fix: 'Use simple equality/range predicates on clustered columns.',
        examples: {
          bad: ['WHERE SUBSTR(username,1,3) = "adm"'],
          good: ['WHERE username = "admin"']
        },
        order: 4
      },
      {
        docId: 'WILDCARD_TABLE_NO_SUFFIX_FILTER',
        id: 'WILDCARD_TABLE_NO_SUFFIX_FILTER',
        title: 'Wildcard without _TABLE_SUFFIX filter',
        severity: 'error',
        enabled: true,
        detect: 'Wildcard table (e.g., events_*) used without a WHERE _TABLE_SUFFIX restriction.',
        fix: 'Filter _TABLE_SUFFIX by equality or bounded range.',
        examples: {
          bad: ['FROM `project.dataset.events_*`'],
          good: ['FROM `project.dataset.events_*` WHERE _TABLE_SUFFIX BETWEEN @s AND @e']
        },
        order: 5
      },
      {
        docId: 'EXCESSIVE_WILDCARD_SCOPE',
        id: 'EXCESSIVE_WILDCARD_SCOPE',
        title: 'Wildcard range too broad',
        severity: 'warning',
        enabled: true,
        detect: 'Wildcard _TABLE_SUFFIX range spans an overly large period (e.g., months/years) when a narrower window is reasonable.',
        fix: 'Narrow the _TABLE_SUFFIX range or migrate to a partitioned table.',
        examples: {
          bad: ['WHERE _TABLE_SUFFIX BETWEEN "20190101" AND "20251231"'],
          good: ['WHERE _TABLE_SUFFIX BETWEEN "20250701" AND "20250731"']
        },
        order: 6
      },
      {
        docId: 'CROSS_JOIN_WARNING',
        id: 'CROSS_JOIN_WARNING',
        title: 'Cross join without predicate',
        severity: 'error',
        enabled: true,
        detect: 'Explicit CROSS JOIN or comma join/UNNEST without restrictive predicate causing Cartesian product.',
        fix: 'Use JOIN with ON/USING and apply filters early.',
        examples: {
          bad: ['SELECT * FROM a, b', 'SELECT * FROM a CROSS JOIN b'],
          good: ['SELECT * FROM a JOIN b ON a.id = b.id']
        },
        order: 7
      },
      {
        docId: 'SELF_JOIN_ANTIPATTERN',
        id: 'SELF_JOIN_ANTIPATTERN',
        title: 'Self-join pattern likely replaceable',
        severity: 'warning',
        enabled: true,
        detect: 'Self-join used to compare rows where analytic functions/pivots could avoid duplication.',
        fix: 'Use window functions or pivots to avoid self-join if possible.',
        examples: {
          bad: ['FROM t AS a JOIN t AS b ON a.user_id = b.user_id'],
          good: ['SELECT user_id, LAG(val) OVER(PARTITION BY user_id ORDER BY ts) AS prev_val FROM t']
        },
        order: 8
      },
      {
        docId: 'PREAGG_BEFORE_JOIN',
        id: 'PREAGG_BEFORE_JOIN',
        title: 'Join large tables without pre-aggregation',
        severity: 'warning',
        enabled: true,
        detect: 'High-cardinality tables joined directly with no filtering/aggregation on at least one side.',
        fix: 'Pre-aggregate or filter each large input before joining.',
        examples: {
          bad: ['FROM clicks c JOIN purchases p ON c.user_id = p.user_id'],
          good: ['WITH c AS (SELECT user_id, COUNT(*) cnt FROM clicks WHERE dt>=@s GROUP BY user_id) SELECT * FROM c JOIN p ON ...']
        },
        order: 9
      },
      {
        docId: 'INEFFICIENT_JOIN_ORDER',
        id: 'INEFFICIENT_JOIN_ORDER',
        title: 'Potentially inefficient join order',
        severity: 'warning',
        enabled: true,
        detect: 'Very large table appears early or join requires type casts; advise ordering small→large and aligning key types.',
        fix: 'Filter/aggregate small inputs first and join largest last on type-aligned keys.',
        examples: {
          bad: ['FROM big AS b JOIN small AS s ON CAST(b.id AS STRING)=s.id'],
          good: ['FROM (SELECT ... FROM small WHERE ...) s JOIN big b ON b.id = s.id']
        },
        order: 10
      },
      {
        docId: 'JOIN_ON_STRING_KEY',
        id: 'JOIN_ON_STRING_KEY',
        title: 'Join on wide STRING keys',
        severity: 'warning',
        enabled: true,
        detect: 'Joins use large STRING columns when a narrower numeric key exists.',
        fix: 'Prefer numeric/surrogate keys for joins where feasible.',
        examples: {
          bad: ['ON t1.customer_name = t2.customer_name'],
          good: ['ON t1.customer_id = t2.customer_id']
        },
        order: 11
      },
      {
        docId: 'ORDER_BY_WITHOUT_LIMIT',
        id: 'ORDER_BY_WITHOUT_LIMIT',
        title: 'ORDER BY without LIMIT',
        severity: 'warning',
        enabled: true,
        detect: 'Top-level ORDER BY without LIMIT/FETCH on potentially large results.',
        fix: 'Add LIMIT or implement window + early limit.',
        examples: {
          bad: ['SELECT * FROM sales ORDER BY ts DESC'],
          good: ['SELECT * FROM sales ORDER BY ts DESC LIMIT 1000']
        },
        order: 12
      },
      {
        docId: 'ORDER_BY_NOT_OUTERMOST',
        id: 'ORDER_BY_NOT_OUTERMOST',
        title: 'ORDER BY in subquery',
        severity: 'info',
        enabled: true,
        detect: 'ORDER BY appears in subquery/intermediate step (not a window function).',
        fix: 'Remove intermediate sorts or move ORDER BY to the outermost query.',
        examples: {
          bad: ['SELECT * FROM (SELECT * FROM t ORDER BY x) sub'],
          good: ['SELECT * FROM t WHERE x>0 ORDER BY x']
        },
        order: 13
      },
      {
        docId: 'REPEATED_CTE_EVALUATIONS',
        id: 'REPEATED_CTE_EVALUATIONS',
        title: 'CTE reused without materialization',
        severity: 'warning',
        enabled: true,
        detect: 'Same heavy CTE referenced multiple times; may be recomputed per reference.',
        fix: 'Materialize to temp table or restructure to avoid repeated computation.',
        examples: {
          bad: ['WITH heavy AS (SELECT ... FROM big GROUP BY ...) SELECT * FROM heavy h1 JOIN heavy h2 ON ...'],
          good: ['CREATE TEMP TABLE heavy AS SELECT ...; SELECT * FROM heavy h1 JOIN heavy h2 ON ...']
        },
        order: 14
      },
      {
        docId: 'REGEX_COSTLY_IN_WHERE',
        id: 'REGEX_COSTLY_IN_WHERE',
        title: 'Costly REGEXP in WHERE',
        severity: 'warning',
        enabled: true,
        detect: 'Heavy REGEXP_* on large scans; prefer LIKE/equality or precomputed fields.',
        fix: 'Replace regex with simpler predicates or indexed/precomputed fields.',
        examples: {
          bad: ['WHERE REGEXP_CONTAINS(message, r"ERROR.*404")'],
          good: ['WHERE message LIKE "%ERROR%" AND status = 404']
        },
        order: 15
      },
      {
        docId: 'UNNECESSARY_DISTINCT',
        id: 'UNNECESSARY_DISTINCT',
        title: 'Unnecessary DISTINCT',
        severity: 'info',
        enabled: true,
        detect: 'DISTINCT used where results are already unique (e.g., due to GROUP BY or primary key).',
        fix: 'Remove DISTINCT or correct join/aggregation producing duplicates.',
        examples: {
          bad: ['SELECT DISTINCT user_id FROM (SELECT user_id, COUNT(*) c FROM clicks GROUP BY user_id)'],
          good: ['SELECT user_id FROM (SELECT user_id, COUNT(*) c FROM clicks GROUP BY user_id)']
        },
        order: 16
      },
      {
        docId: 'LARGE_RESULT_NO_MATERIALIZATION',
        id: 'LARGE_RESULT_NO_MATERIALIZATION',
        title: 'Huge result not materialized',
        severity: 'warning',
        enabled: true,
        detect: 'Query returns extremely large result to client instead of writing to a table.',
        fix: 'Write results to a destination table or reduce output size with filters/LIMIT.',
        examples: {
          bad: ['SELECT * FROM `project.dataset.page_views`'],
          good: ['CREATE TABLE `project.dataset.page_views_sample` AS SELECT * FROM ... WHERE ...']
        },
        order: 17
      },
      {
        docId: 'SUBQUERY_IN_WHERE',
        id: 'SUBQUERY_IN_WHERE',
        title: 'Subquery in WHERE (IN/NOT IN)',
        severity: 'warning',
        enabled: true,
        detect: 'Filtering via subquery IN/NOT IN that could be JOIN/EXISTS for better efficiency.',
        fix: 'Rewrite as JOIN/SEMI JOIN (EXISTS) when equivalent.',
        examples: {
          bad: ['WHERE user_id IN (SELECT user_id FROM premium_users)'],
          good: ['JOIN premium_users USING (user_id)']
        },
        order: 18
      },
      {
        docId: 'MISSING_LIMIT',
        id: 'MISSING_LIMIT',
        title: 'Missing LIMIT on large result',
        severity: 'info',
        enabled: true,
        detect: 'Query lacks LIMIT and may return many rows during exploration.',
        fix: 'Add LIMIT for exploration; remove only when full output is required.',
        examples: {
          bad: ['SELECT * FROM events WHERE event_type="CLICK"'],
          good: ['SELECT * FROM events WHERE event_type="CLICK" LIMIT 1000']
        },
        order: 19
      },
      {
        docId: 'NO_WHERE_CLAUSE',
        id: 'NO_WHERE_CLAUSE',
        title: 'No WHERE on large table',
        severity: 'error',
        enabled: true,
        detect: 'Full-table scan with no WHERE filters on a large table.',
        fix: 'Add selective WHERE predicates; for time-series, filter by date/partition.',
        examples: {
          bad: ['SELECT * FROM `project.dataset.large_table`'],
          good: ['SELECT * FROM `project.dataset.large_table` WHERE dt >= @start AND dt < @end']
        },
        order: 20
      },
      {
        docId: 'MULTIPLE_WILDCARD_TABLES',
        id: 'MULTIPLE_WILDCARD_TABLES',
        title: 'Multiple wildcard sources',
        severity: 'warning',
        enabled: true,
        detect: 'Query uses multiple wildcard tables without tight filters, compounding scanned data.',
        fix: 'Narrow each wildcard range or consolidate into a partitioned table.',
        examples: {
          bad: ['FROM `project.dataset.a_*` a JOIN `project.dataset.b_*` b ON a.id=b.id'],
          good: ['FROM `project.dataset.a_*` WHERE _TABLE_SUFFIX BETWEEN @s AND @e']
        },
        order: 21
      }
    ];
  }
};