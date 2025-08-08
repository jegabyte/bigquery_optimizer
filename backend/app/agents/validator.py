"""
Rule Validator Agent
Validates queries against optimization rules
"""

from typing import List, Optional
from pydantic import BaseModel, Field
from google import genai
from google.genai.types import GenerateContentConfig
import yaml
from pathlib import Path


class RuleViolation(BaseModel):
    """Schema for rule violations"""
    rule_id: str = Field(description="Unique identifier for the rule")
    rule_name: str = Field(description="Name of the violated rule")
    severity: str = Field(description="Severity: critical, high, medium, low")
    description: str = Field(description="Description of the violation")
    location: Optional[str] = Field(default=None, description="Location in query where violation occurs")
    fix_suggestion: str = Field(description="Suggestion for fixing the violation")
    estimated_impact: Optional[str] = Field(default=None, description="Estimated performance/cost impact")


class ValidationResult(BaseModel):
    """Output schema for rule validation"""
    violations: List[RuleViolation] = Field(description="List of rule violations found")
    optimization_score: int = Field(description="Overall optimization score (0-100)")
    total_issues: int = Field(description="Total number of issues found")
    critical_issues: int = Field(description="Number of critical issues")
    high_issues: int = Field(description="Number of high severity issues")
    suggestions: List[str] = Field(description="General optimization suggestions")


# Load optimization rules from YAML
def load_rules():
    """Load optimization rules from configuration"""
    rules_path = Path(__file__).parent.parent / "config" / "rules.yaml"
    if rules_path.exists():
        with open(rules_path, 'r') as f:
            return yaml.safe_load(f)
    else:
        # Default rules if file doesn't exist
        return {
            "rules": [
                {
                    "id": "NO_SELECT_STAR",
                    "name": "Avoid SELECT *",
                    "severity": "high",
                    "description": "SELECT * scans all columns which increases cost",
                    "pattern": "SELECT \\*",
                    "fix": "Specify only required columns"
                },
                {
                    "id": "USE_PARTITION_FILTER",
                    "name": "Use partition filter",
                    "severity": "high",
                    "description": "Queries should filter on partition column to reduce data scanned",
                    "pattern": "Missing WHERE clause on partition column",
                    "fix": "Add WHERE clause filtering on partition column"
                },
                {
                    "id": "AVOID_CROSS_JOIN",
                    "name": "Avoid cross joins",
                    "severity": "critical",
                    "description": "Cross joins create cartesian products",
                    "pattern": "CROSS JOIN or JOIN without ON clause",
                    "fix": "Use proper JOIN conditions"
                },
                {
                    "id": "LIMIT_WITHOUT_ORDER",
                    "name": "Use LIMIT with ORDER BY",
                    "severity": "medium",
                    "description": "LIMIT without ORDER BY gives non-deterministic results",
                    "pattern": "LIMIT without ORDER BY",
                    "fix": "Add ORDER BY clause when using LIMIT"
                }
            ]
        }


# Create the rule validator agent
rules_config = load_rules()
rules_text = "\n".join([f"- {rule['name']}: {rule['description']}" for rule in rules_config.get('rules', [])])

rule_validator_agent = genai.Agent(
    model="gemini-2.0-flash-exp",
    instructions=f"""You are a BigQuery query optimization rules validator. Your role is to analyze queries and identify optimization issues based on best practices.

    Check for these common issues:
    {rules_text}
    
    Additional checks:
    - Unnecessary subqueries that could be CTEs or JOINs
    - Missing indexes or clustering opportunities
    - Inefficient window functions
    - Redundant DISTINCT operations
    - Non-sargable WHERE clauses (functions on columns)
    - Missing partition pruning
    - Inefficient string operations
    - Unnecessary data type conversions
    
    For each issue found:
    1. Identify the specific problem
    2. Assess its severity (critical, high, medium, low)
    3. Explain the performance/cost impact
    4. Provide a concrete fix suggestion
    
    Calculate an optimization score (0-100) based on:
    - 100: No issues found
    - -20 points for each critical issue
    - -10 points for each high severity issue
    - -5 points for each medium severity issue
    - -2 points for each low severity issue
    
    Be specific and actionable in your recommendations.
    """,
    generation_config=GenerateContentConfig(
        temperature=0.4,
        top_k=40,
        top_p=0.95,
        max_output_tokens=4096,
        response_mime_type="application/json",
        response_schema=ValidationResult,
    ),
)