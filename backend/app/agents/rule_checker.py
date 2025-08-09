"""
Rule Checker Agent
Checks query against BigQuery best practices and optimization rules from config/rules.yaml
"""

import os
import yaml
from google.adk.agents import LlmAgent
from app.agents.callbacks import create_streaming_callback

# Load rules from YAML file
def load_rules():
    """Load rules from the rules.yaml configuration file"""
    rules_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'config', 'rules.yaml')
    
    # If rules.yaml doesn't exist in config, create it
    if not os.path.exists(rules_path):
        os.makedirs(os.path.dirname(rules_path), exist_ok=True)
        # Use default rules if file doesn't exist
        default_rules = {
            'version': 2,
            'rules': [
                {
                    'id': 'NO_SELECT_STAR',
                    'title': 'Avoid SELECT *',
                    'severity': 'warning',
                    'enabled': True,
                    'detect': 'Flag wildcard projection (* or t.*) except COUNT(*), * EXCEPT(...), or * REPLACE(...).',
                    'fix': 'Select only required columns.'
                },
                {
                    'id': 'MISSING_PARTITION_FILTER',
                    'title': 'Missing partition filter',
                    'severity': 'error',
                    'enabled': True,
                    'detect': 'Partitioned table read without a WHERE on its partition column.',
                    'fix': 'Add a constant/param range filter on the partition column.'
                }
            ]
        }
        with open(rules_path, 'w') as f:
            yaml.dump(default_rules, f)
        return yaml.dump(default_rules)
    
    # Load existing rules
    with open(rules_path, 'r') as f:
        rules_content = f.read()
    return rules_content

# Load rules YAML content
RULES_YAML = load_rules()

# Count enabled rules for instruction
try:
    rules_data = yaml.safe_load(RULES_YAML)
    enabled_rules_count = sum(1 for rule in rules_data.get('rules', []) if rule.get('enabled', True))
except:
    enabled_rules_count = 20  # fallback

# Rule Checker Agent with proper instruction template
rule_checker = LlmAgent(
    model="gemini-2.5-flash",
    name="rule_checker",
    description="Checks query against optimization rules using rules.yaml",
    instruction=f"""
You are a BigQuery SQL anti-pattern checker.

You will receive:
1. The original SQL query to analyze
2. A JSON object called "metadata_output" from the previous stage containing table metadata

Parse the metadata_output to understand:
- Table sizes (size_gb, row_count)
- Partitioning configuration (partitioned, partition_field)
- Clustering configuration (clustered, cluster_fields)
- Table types (TABLE vs VIEW)
- For views: underlying table information

Evaluate the SQL against EVERY supplied anti-pattern rule from the "Rules" section.
Use the Metadata to understand table partitioning, clustering, sizes, and types.
Report findings as STRICT JSON only (no markdown, no explanations, no code fences).

Constraints:
- Map rule severities from rules.yaml → output levels:
  error → "high", warning → "medium", info → "low".
- "rules_checked" = number of enabled rules supplied ({enabled_rules_count}).
- "violations_found" = count of rules that FAILED.
- "compliance_score" = floor(100 * len(passed_rules) / rules_checked).
- "violations" items must include: rule_id, severity (high/medium/low), impact (short, specific), fix (one-line).
- Include every non-failed rule id in "passed_rules".
- Be precise and conservative; if unsure, do NOT invent violations.

When assessing impact, use actual metadata:
- If a table has size_gb=100, say "Scanning 100GB of data"
- If a table has row_count=1000000, say "Processing 1M rows"
- If a table is partitioned but filter is missing, say "Full scan on partitioned table (X GB)"
- If a view references large underlying tables, consider their sizes

# Rules (from rules.yaml):
{RULES_YAML}

# Output (STRICT JSON; EXACT schema)
{{
  "rules_checked": <int>,
  "violations_found": <int>,
  "compliance_score": <int>,
  "violations": [
    {{
      "rule_id": "STRING",
      "severity": "high|medium|low",
      "impact": "STRING",
      "fix": "STRING"
    }}
  ],
  "passed_rules": ["RULE_ID", "..."],
  "summary": "STRING"
}}

CRITICAL: Output ONLY the JSON. No markdown, no explanations, no text before or after.
Use the metadata from metadata_output to provide specific, quantified impacts.
""",
    output_key="rules_output",
    after_agent_callback=create_streaming_callback(
        "rule_checker",
        "✅ Rule Analysis Complete",
        "rules_output"
    )
)