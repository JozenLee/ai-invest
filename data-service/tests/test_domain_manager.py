"""
Test suite for DomainManager
"""
import pytest
import os
from services.kg.domain_manager import DomainManager
from services.kg.models import DomainConfig, EntityDefinition, RelationshipDefinition


class TestDomainManager:
    """Test DomainManager functionality"""

    @pytest.fixture
    def domain_manager(self):
        """Create DomainManager instance"""
        return DomainManager()

    def test_load_ai_hardware_domain(self, domain_manager):
        """Verify AI hardware domain loads correctly"""
        domain = domain_manager.get_domain("ai-hardware")

        assert domain is not None
        assert domain.code == "ai-hardware"
        assert domain.name == "AI算力硬件"
        assert domain.description == "AI芯片、GPU、加速器及供应链"
        assert domain.version == "1.0"

        # Check entities
        assert len(domain.entities) == 2
        entity_types = {e.type for e in domain.entities}
        assert "hardware_company" in entity_types
        assert "hardware_product" in entity_types

        # Check hardware_company entity
        company_entity = next(e for e in domain.entities if e.type == "hardware_company")
        assert company_entity.label == "硬件公司"
        assert len(company_entity.properties) == 5

        # Check required property
        name_prop = next(p for p in company_entity.properties if p.name == "name")
        assert name_prop.required is True
        assert name_prop.type == "string"

        # Check relationships
        assert len(domain.relationships) == 2
        rel_types = {r.type for r in domain.relationships}
        assert "MANUFACTURES" in rel_types
        assert "COMPETES_WITH" in rel_types

        # Check MANUFACTURES relationship
        mfg_rel = next(r for r in domain.relationships if r.type == "MANUFACTURES")
        assert mfg_rel.from_type == "hardware_company"
        assert mfg_rel.to_type == "hardware_product"
        assert mfg_rel.bidirectional is False

        # Check COMPETES_WITH relationship
        compete_rel = next(r for r in domain.relationships if r.type == "COMPETES_WITH")
        assert compete_rel.bidirectional is True

        # Check data sources
        assert len(domain.data_sources) == 1
        assert domain.data_sources[0].name == "openbb"
        assert domain.data_sources[0].enabled is True

    def test_list_all_domains(self, domain_manager):
        """Verify list returns all domains"""
        domains = domain_manager.list_domains()

        assert len(domains) >= 1
        domain_codes = {d.code for d in domains}
        assert "ai-hardware" in domain_codes

    def test_validate_entity_success(self, domain_manager):
        """Valid entity passes validation"""
        valid_data = {
            "name": "NVIDIA",
            "ticker": "NVDA",
            "country": "USA",
            "market_cap": 2000000000000.0,
            "founded_year": 1993
        }

        result = domain_manager.validate_entity("ai-hardware", "hardware_company", valid_data)
        assert result is True

    def test_validate_entity_missing_required(self, domain_manager):
        """Invalid entity fails validation when required field is missing"""
        invalid_data = {
            "ticker": "NVDA",
            "country": "USA"
            # Missing required 'name' field
        }

        result = domain_manager.validate_entity("ai-hardware", "hardware_company", invalid_data)
        assert result is False

    def test_validate_entity_optional_fields(self, domain_manager):
        """Entity with only required fields should pass validation"""
        minimal_data = {
            "name": "NVIDIA"
            # All other fields are optional
        }

        result = domain_manager.validate_entity("ai-hardware", "hardware_company", minimal_data)
        assert result is True

    def test_get_nonexistent_domain(self, domain_manager):
        """Get non-existent domain returns None"""
        domain = domain_manager.get_domain("nonexistent")
        assert domain is None

    def test_validate_entity_nonexistent_domain(self, domain_manager):
        """Validation fails for non-existent domain"""
        result = domain_manager.validate_entity("nonexistent", "entity", {})
        assert result is False

    def test_validate_entity_nonexistent_type(self, domain_manager):
        """Validation fails for non-existent entity type"""
        result = domain_manager.validate_entity("ai-hardware", "nonexistent", {"name": "test"})
        assert result is False

    def test_hardware_product_validation(self, domain_manager):
        """Test hardware_product entity validation"""
        valid_product = {
            "model": "H100",
            "product_type": "GPU",
            "launch_date": "2022-03-22",
            "process_node": "4nm",
            "memory_gb": 80,
            "compute_fp16_tflops": 2000.0,
            "tdp_watts": 700
        }

        result = domain_manager.validate_entity("ai-hardware", "hardware_product", valid_product)
        assert result is True

        # Test with only required fields
        minimal_product = {
            "model": "H100",
            "product_type": "GPU"
        }
        result = domain_manager.validate_entity("ai-hardware", "hardware_product", minimal_product)
        assert result is True

        # Test missing required field
        invalid_product = {
            "model": "H100"
            # Missing required 'product_type'
        }
        result = domain_manager.validate_entity("ai-hardware", "hardware_product", invalid_product)
        assert result is False
