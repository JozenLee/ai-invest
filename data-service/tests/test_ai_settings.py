from unittest.mock import Mock, AsyncMock
import pytest
from core import ai_settings

@pytest.fixture
def env_file(tmp_path, monkeypatch):
    path = tmp_path / '.env'
    path.write_text('ANTHROPIC_API_KEY=global-key\nCLAUDE_MODEL=old-model\n')
    monkeypatch.setattr(ai_settings, 'ENV_PATH', path)
    return path

def test_defaults_and_live_reload(env_file, monkeypatch):
    sdk = Mock()
    factory = Mock(return_value=sdk)
    monkeypatch.setattr(ai_settings.anthropic, 'Anthropic', factory)
    client = ai_settings.scene_client('news')
    client.messages.create(model='ignored', max_tokens=9999)
    assert sdk.messages.create.call_args.kwargs['model'] == 'claude-sonnet-5'
    assert ai_settings.get_ai_settings('comprehensive')['model'] == 'claude-opus-5'
    env_file.write_text('AI_NEWS_API_KEY=rotated\nAI_NEWS_MODEL=custom\nAI_NEWS_MAX_TOKENS=3000\n')
    client.messages.create(model='ignored', max_tokens=9999)
    assert sdk.messages.create.call_args.kwargs == {'model': 'custom', 'max_tokens': 3000}
    assert factory.call_args.kwargs['api_key'] == 'rotated'

@pytest.mark.asyncio
async def test_async_client_can_be_configured_after_startup(env_file, monkeypatch):
    env_file.write_text('ANTHROPIC_API_KEY=\n')
    sdk = Mock()
    sdk.messages.create = AsyncMock(return_value='result')
    monkeypatch.setattr(ai_settings.anthropic, 'AsyncAnthropic', Mock(return_value=sdk))
    client = ai_settings.async_scene_client('news')
    assert not client
    env_file.write_text('AI_NEWS_API_KEY=new-key\n')
    assert client
    assert await client.messages.create(model='ignored', max_tokens=1024) == 'result'
    assert sdk.messages.create.call_args.kwargs['model'] == 'claude-sonnet-5'
