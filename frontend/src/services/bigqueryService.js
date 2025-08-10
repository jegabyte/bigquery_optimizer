/**
 * BigQuery Service for Direct Data Access
 * Uses BigQuery REST API to fetch data from INFORMATION_SCHEMA
 */

const BQ_API_BASE = 'https://bigquery.googleapis.com/bigquery/v2';

class BigQueryService {
  constructor() {
    this.accessToken = null;
    this.projectId = null;
  }

  /**
   * Initialize with Google OAuth token
   */
  async init(accessToken, projectId) {
    this.accessToken = accessToken;
    this.projectId = projectId;
  }

  /**
   * Execute a BigQuery SQL query
   */
  async executeQuery(query, projectId = null) {
    const targetProject = projectId || this.projectId;
    
    if (!this.accessToken) {
      throw new Error('BigQuery service not initialized. Please authenticate first.');
    }

    const response = await fetch(`${BQ_API_BASE}/projects/${targetProject}/queries`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        useLegacySql: false,
        maxResults: 10000,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`BigQuery API error: ${error.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    return this.formatQueryResults(data);
  }

  /**
   * Format BigQuery response into usable data
   */
  formatQueryResults(response) {
    if (!response.rows) return [];
    
    const fields = response.schema.fields;
    return response.rows.map(row => {
      const obj = {};
      row.f.forEach((field, index) => {
        const fieldName = fields[index].name;
        obj[fieldName] = field.v;
      });
      return obj;
    });
  }

  /**
   * Fetch recent queries from INFORMATION_SCHEMA
   */
  async fetchRecentQueries(projectId, days = 30) {
    const query = `
      SELECT 
        job_id,
        query,
        user_email,
        creation_time,
        start_time,
        end_time,
        total_bytes_processed,
        total_bytes_billed,
        total_slot_ms,
        TIMESTAMP_DIFF(end_time, start_time, SECOND) as runtime_seconds,
        error_result,
        statement_type,
        referenced_tables,
        labels
      FROM \`${projectId}.region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT\`
      WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${days} DAY)
        AND statement_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'MERGE')
        AND error_result IS NULL
        AND query IS NOT NULL
        AND total_bytes_processed > 0
      ORDER BY creation_time DESC
      LIMIT 10000
    `;

    return await this.executeQuery(query, projectId);
  }

  /**
   * Group queries into templates by normalizing SQL patterns
   */
  groupQueriesIntoTemplates(queries) {
    const templates = new Map();

    queries.forEach(query => {
      // Normalize the SQL to create a pattern
      const pattern = this.normalizeSqlPattern(query.query);
      const hash = this.hashString(pattern);

      if (!templates.has(hash)) {
        templates.set(hash, {
          template_id: `tmpl_${hash.substring(0, 8)}`,
          template_hash: hash,
          sql_pattern: pattern.substring(0, 200),
          full_sql: query.query,
          tables_used: this.extractTables(query.referenced_tables),
          runs: [],
          total_runs: 0,
          total_bytes_processed: 0,
          first_seen: query.creation_time,
          last_seen: query.creation_time,
        });
      }

      const template = templates.get(hash);
      template.runs.push({
        job_id: query.job_id,
        start_time: query.start_time,
        bytes_processed: parseInt(query.total_bytes_processed || 0),
        runtime_seconds: parseFloat(query.runtime_seconds || 0),
        user_email: query.user_email,
      });
      
      template.total_runs++;
      template.total_bytes_processed += parseInt(query.total_bytes_processed || 0);
      
      if (query.creation_time > template.last_seen) {
        template.last_seen = query.creation_time;
      }
      if (query.creation_time < template.first_seen) {
        template.first_seen = query.creation_time;
      }
    });

    // Calculate statistics for each template
    templates.forEach(template => {
      const bytes = template.runs.map(r => r.bytes_processed).sort((a, b) => a - b);
      const runtimes = template.runs.map(r => r.runtime_seconds).sort((a, b) => a - b);
      
      template.p50_bytes_processed = bytes[Math.floor(bytes.length * 0.5)] || 0;
      template.p90_bytes_processed = bytes[Math.floor(bytes.length * 0.9)] || 0;
      template.p99_bytes_processed = bytes[Math.floor(bytes.length * 0.99)] || 0;
      
      template.p50_runtime_seconds = runtimes[Math.floor(runtimes.length * 0.5)] || 0;
      template.p90_runtime_seconds = runtimes[Math.floor(runtimes.length * 0.9)] || 0;
      
      template.avg_runtime_seconds = runtimes.reduce((a, b) => a + b, 0) / runtimes.length;
      template.runs_per_day = template.total_runs / 30; // Assuming 30-day window
    });

    return Array.from(templates.values());
  }

  /**
   * Normalize SQL pattern by replacing literals with placeholders
   */
  normalizeSqlPattern(sql) {
    if (!sql) return '';
    
    let normalized = sql
      // Remove comments
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim()
      // Replace string literals
      .replace(/'[^']*'/g, '?')
      .replace(/"[^"]*"/g, '?')
      // Replace numbers
      .replace(/\b\d+\.?\d*\b/g, '?')
      // Replace date literals
      .replace(/DATE\s*\([^)]+\)/gi, 'DATE(?)')
      .replace(/TIMESTAMP\s*\([^)]+\)/gi, 'TIMESTAMP(?)')
      // Uppercase keywords
      .toUpperCase();

    return normalized;
  }

  /**
   * Extract table names from referenced_tables JSON
   */
  extractTables(referencedTables) {
    if (!referencedTables) return [];
    
    try {
      const tables = JSON.parse(referencedTables);
      return tables.map(t => `${t.dataset_id}.${t.table_id}`);
    } catch {
      return [];
    }
  }

  /**
   * Simple hash function for SQL patterns
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Save project to bq_optimizer dataset
   */
  async saveProject(projectConfig) {
    const query = `
      INSERT INTO \`${this.projectId}.bq_optimizer.projects\` (
        project_id,
        display_name,
        analysis_window,
        regions,
        datasets,
        pricing_mode,
        price_per_tb,
        auto_detect_regions,
        auto_detect_datasets,
        created_at,
        updated_at
      ) VALUES (
        '${projectConfig.project_id}',
        '${projectConfig.display_name || projectConfig.project_id}',
        ${projectConfig.analysis_window || 30},
        ${projectConfig.regions ? `[${projectConfig.regions.map(r => `'${r}'`).join(',')}]` : '[]'},
        ${projectConfig.datasets ? `[${projectConfig.datasets.map(d => `'${d}'`).join(',')}]` : '[]'},
        '${projectConfig.pricing_mode || 'on-demand'}',
        ${projectConfig.price_per_tb || 5.00},
        ${projectConfig.auto_detect_regions !== false},
        ${projectConfig.auto_detect_datasets !== false},
        CURRENT_TIMESTAMP(),
        CURRENT_TIMESTAMP()
      )
    `;

    return await this.executeQuery(query);
  }

  /**
   * Save templates to bq_optimizer dataset
   */
  async saveTemplates(projectId, templates) {
    if (templates.length === 0) return;

    const values = templates.map(t => `(
      '${t.template_id}',
      '${projectId}',
      '${t.template_hash}',
      '''${t.sql_pattern.replace(/'/g, "\\'")}''',
      '''${t.full_sql.replace(/'/g, "\\'")}''',
      [${t.tables_used.map(table => `'${table}'`).join(',')}],
      TIMESTAMP('${t.first_seen}'),
      TIMESTAMP('${t.last_seen}'),
      ${t.total_runs},
      ${t.total_bytes_processed},
      ${t.avg_runtime_seconds},
      ${t.p50_bytes_processed},
      ${t.p90_bytes_processed},
      ${t.p99_bytes_processed},
      ${t.p50_runtime_seconds},
      ${t.p90_runtime_seconds},
      'new',
      CURRENT_TIMESTAMP(),
      CURRENT_TIMESTAMP()
    )`).join(',\n');

    const query = `
      INSERT INTO \`${this.projectId}.bq_optimizer.query_templates\` (
        template_id,
        project_id,
        template_hash,
        sql_pattern,
        full_sql,
        tables_used,
        first_seen,
        last_seen,
        total_runs,
        total_bytes_processed,
        avg_runtime_seconds,
        p50_bytes_processed,
        p90_bytes_processed,
        p99_bytes_processed,
        p50_runtime_seconds,
        p90_runtime_seconds,
        state,
        created_at,
        updated_at
      ) VALUES ${values}
    `;

    return await this.executeQuery(query);
  }

  /**
   * Fetch projects from bq_optimizer dataset
   */
  async fetchProjects() {
    const query = `
      SELECT 
        p.*,
        ps.templates_discovered,
        ps.total_runs,
        ps.total_tb_processed,
        ps.estimated_monthly_spend,
        ps.avg_compliance_score,
        ps.potential_monthly_savings
      FROM \`${this.projectId}.bq_optimizer.projects\` p
      LEFT JOIN \`${this.projectId}.bq_optimizer.project_stats\` ps
        ON p.project_id = ps.project_id
      WHERE p.is_active = true
      ORDER BY p.created_at DESC
    `;

    return await this.executeQuery(query);
  }

  /**
   * Fetch templates for a project
   */
  async fetchProjectTemplates(projectId) {
    const query = `
      SELECT 
        t.*,
        a.compliance_score,
        a.optimized_sql,
        a.estimated_cost_before,
        a.estimated_cost_after,
        a.savings_percentage,
        a.issues
      FROM \`${this.projectId}.bq_optimizer.query_templates\` t
      LEFT JOIN (
        SELECT 
          template_id,
          compliance_score,
          optimized_sql,
          estimated_cost_before,
          estimated_cost_after,
          savings_percentage,
          issues,
          ROW_NUMBER() OVER (PARTITION BY template_id ORDER BY created_at DESC) as rn
        FROM \`${this.projectId}.bq_optimizer.template_analyses\`
      ) a ON t.template_id = a.template_id AND a.rn = 1
      WHERE t.project_id = '${projectId}'
      ORDER BY t.total_bytes_processed DESC
    `;

    return await this.executeQuery(query);
  }

  /**
   * Get top cost drivers for a project
   */
  async fetchTopCostDrivers(projectId) {
    const query = `
      SELECT 
        query_snippet,
        primary_table,
        total_runs,
        gb_processed,
        estimated_cost
      FROM \`${this.projectId}.bq_optimizer.top_cost_drivers\`
      WHERE project_id = '${projectId}'
      ORDER BY rank
      LIMIT 5
    `;

    return await this.executeQuery(query);
  }
}

// Export singleton instance
export const bigQueryService = new BigQueryService();
export default bigQueryService;