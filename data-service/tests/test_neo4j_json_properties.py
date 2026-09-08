from services.neo4j_service import _json_property


def test_json_property_supports_legacy_and_new_graph_values():
    assert _json_property('[{"code":"159001"}]', []) == [{"code": "159001"}]
    assert _json_property([{"code": "159001"}], []) == [{"code": "159001"}]
    assert _json_property(None, []) == []
    assert _json_property('invalid', {}) == {}
