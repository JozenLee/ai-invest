"""Shared scene configuration from the repository root .env, resolved per request."""
import os
from pathlib import Path
from dotenv import dotenv_values
import anthropic

ENV_PATH = Path(__file__).resolve().parents[2] / '.env'
DEFAULTS = {
    'news': ('claude-sonnet-5', 4096),
    'comprehensive': ('claude-opus-5', 16384),
    'graph': ('claude-sonnet-5', 8192),
    'matching': ('claude-sonnet-5', 8192),
    'event': ('claude-sonnet-5', 4096),
}


def get_ai_settings(scene):
    env = {**os.environ, **dotenv_values(ENV_PATH)}
    prefix = f'AI_{scene.upper()}_'
    model, budget = DEFAULTS[scene]
    configured_budget = env.get(prefix + 'MAX_TOKENS')
    return {
        'model': env.get(prefix + 'MODEL') or model,
        'max_tokens': int(configured_budget) if configured_budget else budget,
        'custom_max_tokens': bool(configured_budget),
        'api_key': env.get(prefix + 'API_KEY') or env.get('ANTHROPIC_API_KEY') or '',
        'base_url': env.get('ANTHROPIC_BASE_URL') or None,
    }


class SceneClient:
    def __init__(self, scene, asynchronous=False, **options):
        self.scene = scene
        self.asynchronous = asynchronous
        self.options = options
        self.messages = self
        self._client = None
        self._fingerprint = None

    def __bool__(self):
        return bool(get_ai_settings(self.scene)['api_key'] or self.options.get('api_key'))

    def create(self, **params):
        config = get_ai_settings(self.scene)
        key = config['api_key'] or self.options.get('api_key')
        if not key:
            raise ValueError('请在设置中配置 AI API Token')
        base_url = config['base_url'] or self.options.get('base_url')
        fingerprint = (key, base_url)
        if self._client is None or fingerprint != self._fingerprint:
            options = {**self.options, 'api_key': key}
            if base_url:
                options['base_url'] = base_url
            else:
                options.pop('base_url', None)
            factory = anthropic.AsyncAnthropic if self.asynchronous else anthropic.Anthropic
            self._client = factory(**options)
            self._fingerprint = fingerprint
        params['model'] = config['model']
        params['max_tokens'] = min(params.get('max_tokens') or config['max_tokens'], config['max_tokens'])
        return self._client.messages.create(**params)


def scene_client(scene, **options):
    return SceneClient(scene, **options)


def async_scene_client(scene, **options):
    return SceneClient(scene, asynchronous=True, **options)
