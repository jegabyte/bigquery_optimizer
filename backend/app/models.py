from pydantic import BaseModel, Field
from typing import Optional, Dict, List, Any
from datetime import datetime
from enum import Enum

class Severity(str, Enum):
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"

class QueryOptions(BaseModel):
    rewrite: bool = True
    validate: bool = False
    projectName: Optional[str] = None

class QueryOptimizationRequest(BaseModel):
    query: str
    options: QueryOptions = QueryOptions()

class RuleViolation(BaseModel):
    rule_id: str
    name: str
    status: str
    severity: Severity
    evidence: Dict[str, Any]
    remediation: str
    confidence: float = Field(ge=0, le=1)

class ValidationResult(BaseModel):
    resultsMatch: bool
    originalBytesProcessed: int
    optimizedBytesProcessed: int
    costSavingsFraction: float
    executionTimeOriginal: Optional[float] = None
    executionTimeOptimized: Optional[float] = None

class QueryOptimizationResponse(BaseModel):
    ruleset_version: int
    issues: List[RuleViolation]
    originalQuery: str
    optimizedQuery: Optional[str] = None
    validation: Optional[ValidationResult] = None
    processingTime: float
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class Rule(BaseModel):
    id: str
    name: str
    severity: Severity
    enabled: bool = True
    requires_metadata: bool = False
    detection_instructions: str
    remediation_instructions: str
    bad_examples: List[str] = []
    good_examples: List[str] = []

class RulesetConfig(BaseModel):
    version: int
    rules: List[Rule]

class TableMetadata(BaseModel):
    project_id: str
    dataset_id: str
    table_id: str
    schema: List[Dict[str, Any]]
    partitioning: Optional[Dict[str, Any]] = None
    clustering: Optional[List[str]] = None
    size_bytes: Optional[int] = None
    row_count: Optional[int] = None

class AgentResponse(BaseModel):
    agent_name: str
    status: str
    data: Dict[str, Any]
    error: Optional[str] = None
    processing_time: float

class AnalysisStatus(BaseModel):
    id: str
    status: str
    created_at: datetime
    completed_at: Optional[datetime] = None