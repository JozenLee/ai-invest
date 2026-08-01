"""
Domain Manager for loading and managing knowledge graph domain configurations
"""
import os
import yaml
import logging
from pathlib import Path
from typing import Optional, List, Dict
from services.kg.models import (
    DomainConfig,
    EntityDefinition,
    PropertyDefinition,
    RelationshipDefinition,
    DataSourceConfig
)

logger = logging.getLogger(__name__)


class DomainManager:
    """Manages domain configurations for the knowledge graph system"""

    def __init__(self, config_dir: Optional[str] = None):
        """
        Initialize DomainManager and load all domain configurations

        Args:
            config_dir: Path to domains config directory. Defaults to data-service/config/domains/
        """
        if config_dir is None:
            # Default to config/domains/ relative to data-service root
            base_dir = Path(__file__).parent.parent.parent
            config_dir = base_dir / "config" / "domains"

        self.config_dir = Path(config_dir)
        self._domains: Dict[str, DomainConfig] = {}
        self._load_domains()

    def _load_domains(self) -> None:
        """Load all YAML domain configuration files from config directory"""
        if not self.config_dir.exists():
            logger.warning(f"Domain config directory does not exist: {self.config_dir}")
            return

        yaml_files = list(self.config_dir.glob("*.yaml")) + list(self.config_dir.glob("*.yml"))

        for yaml_file in yaml_files:
            try:
                domain_config = self._load_domain_file(yaml_file)
                if domain_config:
                    self._domains[domain_config.code] = domain_config
                    logger.info(f"Loaded domain: {domain_config.code} ({domain_config.name})")
            except Exception as e:
                logger.warning(f"Failed to load domain config {yaml_file}: {e}")

    def _load_domain_file(self, file_path: Path) -> Optional[DomainConfig]:
        """
        Load and parse a single domain YAML file

        Args:
            file_path: Path to YAML file

        Returns:
            DomainConfig object or None if invalid
        """
        with open(file_path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)

        if not data or 'domain' not in data:
            logger.warning(f"Invalid domain config in {file_path}: missing 'domain' section")
            return None

        domain_info = data['domain']

        # Parse entities
        entities = []
        for entity_data in data.get('entities', []):
            properties = [
                PropertyDefinition(
                    name=prop['name'],
                    type=prop['type'],
                    required=prop.get('required', False),
                    description=prop.get('description')
                )
                for prop in entity_data.get('properties', [])
            ]

            entity = EntityDefinition(
                type=entity_data['type'],
                label=entity_data['label'],
                description=entity_data.get('description'),
                properties=properties
            )
            entities.append(entity)

        # Parse relationships
        relationships = []
        for rel_data in data.get('relationships', []):
            properties = [
                PropertyDefinition(
                    name=prop['name'],
                    type=prop['type'],
                    required=prop.get('required', False),
                    description=prop.get('description')
                )
                for prop in rel_data.get('properties', [])
            ]

            relationship = RelationshipDefinition(
                type=rel_data['type'],
                label=rel_data['label'],
                from_type=rel_data['from'],
                to_type=rel_data['to'],
                bidirectional=rel_data.get('bidirectional', False),
                properties=properties
            )
            relationships.append(relationship)

        # Parse data sources
        data_sources = []
        for ds_data in data.get('data_sources', []):
            data_source = DataSourceConfig(
                name=ds_data['name'],
                type=ds_data['type'],
                enabled=ds_data.get('enabled', True),
                schedule=ds_data.get('schedule'),
                config=ds_data.get('config', {})
            )
            data_sources.append(data_source)

        # Create domain config
        domain_config = DomainConfig(
            code=domain_info['code'],
            name=domain_info['name'],
            description=domain_info['description'],
            version=domain_info['version'],
            entities=entities,
            relationships=relationships,
            data_sources=data_sources
        )

        return domain_config

    def get_domain(self, code: str) -> Optional[DomainConfig]:
        """
        Get domain configuration by code

        Args:
            code: Domain code (e.g., 'ai-hardware')

        Returns:
            DomainConfig object or None if not found
        """
        return self._domains.get(code)

    def list_domains(self) -> List[DomainConfig]:
        """
        List all loaded domain configurations

        Returns:
            List of DomainConfig objects
        """
        return list(self._domains.values())

    def validate_entity(self, domain_code: str, entity_type: str, data: dict) -> bool:
        """
        Validate entity data against domain schema

        Args:
            domain_code: Domain code
            entity_type: Entity type to validate against
            data: Entity data dictionary

        Returns:
            True if valid, False otherwise
        """
        # Get domain
        domain = self.get_domain(domain_code)
        if not domain:
            logger.warning(f"Domain not found: {domain_code}")
            return False

        # Find entity definition
        entity_def = None
        for entity in domain.entities:
            if entity.type == entity_type:
                entity_def = entity
                break

        if not entity_def:
            logger.warning(f"Entity type not found: {entity_type} in domain {domain_code}")
            return False

        # Check required properties
        for prop in entity_def.properties:
            if prop.required and prop.name not in data:
                logger.warning(
                    f"Missing required property '{prop.name}' for entity {entity_type}"
                )
                return False

        return True
