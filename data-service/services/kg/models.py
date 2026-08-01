"""
Domain configuration models for knowledge graph system
"""
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any


@dataclass
class PropertyDefinition:
    """Property definition for entities and relationships"""
    name: str
    type: str
    required: bool = False
    description: Optional[str] = None


@dataclass
class EntityDefinition:
    """Entity definition in a domain"""
    type: str
    label: str
    description: Optional[str] = None
    properties: List[PropertyDefinition] = field(default_factory=list)


@dataclass
class RelationshipDefinition:
    """Relationship definition between entities"""
    type: str
    label: str
    from_type: str
    to_type: str
    bidirectional: bool = False
    properties: List[PropertyDefinition] = field(default_factory=list)


@dataclass
class DataSourceConfig:
    """Data source configuration for domain"""
    name: str
    type: str
    enabled: bool = True
    schedule: Optional[str] = None
    config: Dict[str, Any] = field(default_factory=dict)


@dataclass
class DomainConfig:
    """Complete domain configuration"""
    code: str
    name: str
    description: str
    version: str
    entities: List[EntityDefinition] = field(default_factory=list)
    relationships: List[RelationshipDefinition] = field(default_factory=list)
    data_sources: List[DataSourceConfig] = field(default_factory=list)
