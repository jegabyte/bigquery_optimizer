import json
import time
import sqlparse
from typing import Dict, List, Any, Optional
from app.models import (
    QueryOptimizationResponse, 
    RuleViolation, 
    ValidationResult,
    TableMetadata,
    Severity,
    QueryOptions
)

class MetadataAgent:
    async def extract_metadata(self, query: str) -> Dict[str, Any]:
        parsed = sqlparse.parse(query)[0] if sqlparse.parse(query) else None
        tables = []
        
        if parsed:
            for token in parsed.tokens:
                if token.ttype is None and isinstance(token.value, str):
                    if 'FROM' in token.value.upper():
                        tables.append({
                            "name": "sample_table",
                            "project": "project",
                            "dataset": "dataset",
                            "partitioned": True,
                            "partition_column": "date",
                            "clustering_columns": ["user_id"],
                            "size_bytes": 1000000000
                        })
        
        return {
            "tables": tables,
            "query_type": "SELECT",
            "has_joins": "JOIN" in query.upper(),
            "has_aggregation": "GROUP BY" in query.upper()
        }

class RuleValidationAgent:
    def __init__(self):
        self.gemini_mock = GeminiMock()
    
    async def validate_rules(self, query: str, metadata: Dict, rules: List[Dict]) -> List[RuleViolation]:
        prompt = self._build_prompt(query, metadata, rules)
        response = await self.gemini_mock.analyze(prompt)
        return self._parse_response(response, rules)
    
    def _build_prompt(self, query: str, metadata: Dict, rules: List[Dict]) -> str:
        return f"""
Analyze this BigQuery SQL query for anti-patterns:

Query:
{query}

Metadata:
{json.dumps(metadata, indent=2)}

Rules to check:
{json.dumps(rules, indent=2)}

Return JSON with structure:
{{
  "issues": [
    {{
      "rule_id": "RULE_ID",
      "status": "fail|pass",
      "evidence": {{"reason": "specific reason"}},
      "confidence": 0.0-1.0
    }}
  ]
}}
"""
    
    def _parse_response(self, response: Dict, rules: List[Dict]) -> List[RuleViolation]:
        violations = []
        for issue in response.get("issues", []):
            if issue["status"] == "fail":
                rule = next((r for r in rules if r["id"] == issue["rule_id"]), None)
                if rule:
                    violations.append(RuleViolation(
                        rule_id=issue["rule_id"],
                        name=rule["name"],
                        status="fail",
                        severity=Severity(rule["severity"]),
                        evidence=issue.get("evidence", {}),
                        remediation=rule["remediation_instructions"],
                        confidence=issue.get("confidence", 0.9)
                    ))
        return violations

class RewriteAgent:
    def __init__(self):
        self.gemini_mock = GeminiMock()
    
    async def rewrite_query(self, query: str, violations: List[RuleViolation], metadata: Dict) -> str:
        if not violations:
            return query
        
        prompt = f"""
Rewrite this BigQuery SQL query to fix the following issues:

Original Query:
{query}

Issues to fix:
{json.dumps([v.dict() for v in violations], indent=2)}

Metadata:
{json.dumps(metadata, indent=2)}

Return only the optimized SQL query.
"""
        response = await self.gemini_mock.generate_sql(prompt)
        return response

class ValidationAgent:
    async def validate_results(self, original_query: str, optimized_query: str) -> ValidationResult:
        await self._simulate_delay()
        
        original_bytes = len(original_query) * 1000000
        optimized_bytes = len(optimized_query) * 800000
        
        return ValidationResult(
            resultsMatch=True,
            originalBytesProcessed=original_bytes,
            optimizedBytesProcessed=optimized_bytes,
            costSavingsFraction=1 - (optimized_bytes / original_bytes),
            executionTimeOriginal=2.5,
            executionTimeOptimized=1.8
        )
    
    async def _simulate_delay(self):
        import asyncio
        await asyncio.sleep(0.5)

class GeminiMock:
    async def analyze(self, prompt: str) -> Dict:
        issues = []
        
        if "SELECT *" in prompt.upper():
            issues.append({
                "rule_id": "NO_SELECT_STAR",
                "status": "fail",
                "evidence": {"reason": "Wildcard projection found in SELECT clause"},
                "confidence": 0.95
            })
        
        if "CROSS JOIN" in prompt.upper() or ", " in prompt:
            issues.append({
                "rule_id": "CROSS_JOIN_WARNING",
                "status": "fail",
                "evidence": {"reason": "Potential cross join detected"},
                "confidence": 0.85
            })
        
        if "WHERE" not in prompt.upper() and "LIMIT" not in prompt.upper():
            issues.append({
                "rule_id": "MISSING_LIMIT",
                "status": "fail",
                "evidence": {"reason": "No LIMIT clause found"},
                "confidence": 0.75
            })
        
        return {"issues": issues}
    
    async def generate_sql(self, prompt: str) -> str:
        base_query = "SELECT id, name, created_at FROM optimized_table WHERE date >= '2024-01-01' LIMIT 1000"
        return base_query

class AgentPipeline:
    def __init__(self):
        self.metadata_agent = MetadataAgent()
        self.rule_validation_agent = RuleValidationAgent()
        self.rewrite_agent = RewriteAgent()
        self.validation_agent = ValidationAgent()
    
    async def process_query(
        self, 
        query: str, 
        options: QueryOptions,
        ruleset: List[Dict]
    ) -> QueryOptimizationResponse:
        print(f"DEBUG AgentPipeline: Starting query processing")
        start_time = time.time()
        
        try:
            print(f"DEBUG: Extracting metadata...")
            metadata = await self.metadata_agent.extract_metadata(query)
            print(f"DEBUG: Metadata extracted: {metadata}")
            
            print(f"DEBUG: Validating rules...")
            violations = await self.rule_validation_agent.validate_rules(
                query, metadata, ruleset
            )
            print(f"DEBUG: Found {len(violations)} violations")
            
            optimized_query = None
            if options.rewrite and violations:
                print(f"DEBUG: Rewriting query...")
                optimized_query = await self.rewrite_agent.rewrite_query(
                    query, violations, metadata
                )
                print(f"DEBUG: Query rewritten")
            
            validation = None
            if options.validate and optimized_query:
                print(f"DEBUG: Validating results...")
                validation = await self.validation_agent.validate_results(
                    query, optimized_query
                )
                print(f"DEBUG: Validation completed")
            
            processing_time = time.time() - start_time
            
            print(f"DEBUG: Creating response...")
            return QueryOptimizationResponse(
                ruleset_version=1,
                issues=violations,
                originalQuery=query,
                optimizedQuery=optimized_query,
                validation=validation,
                processingTime=processing_time
            )
        except Exception as e:
            print(f"ERROR in AgentPipeline: {str(e)}")
            import traceback
            traceback.print_exc()
            raise