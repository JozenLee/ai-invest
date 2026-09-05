"""Shared subscription defaults + persisted user configuration (no env files)."""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from db import db

DEFAULTS = json.loads((Path(__file__).resolve().parents[2] / 'config/subscription-defaults.json').read_text())
INDEXES = [('sh000001', '上证指数'), ('sz399001', '深证成指'), ('sz399006', '创业板指'), ('sh000688', '科创50'), ('sh000300', '沪深300')]


def get_config():
    config = json.loads(json.dumps(DEFAULTS))
    rows = db.execute("SELECT payload FROM subscription_configuration WHERE id='global'")
    if rows:
        saved = json.loads(rows[0]['payload'])
        policies = {**config['policies'], **saved.get('policies', {})}
        config.update(saved)
        config['policies'] = policies
    config['policies'].pop('market_news', None)
    return config


def parse_timestamp(value):
    if not value:
        return None
    if isinstance(value, (float, int)) or str(value).isdigit():
        return datetime.fromtimestamp(float(value) / 1000, timezone.utc)
    parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed


def market_open(market='cn', now=None):
    market = market.lower()
    now = now or datetime.now(timezone.utc)
    local = now.astimezone(ZoneInfo('America/New_York' if market == 'us' else 'Asia/Shanghai'))
    if local.weekday() >= 5:
        return False
    minute = local.hour * 60 + local.minute
    if market == 'us':
        return 570 <= minute < 960
    if market == 'hk':
        return 570 <= minute < 720 or 780 <= minute < 960
    return 570 <= minute < 690 or 780 <= minute < 900


def next_run(policy, now, market='cn'):
    if policy['mode'] == 'interval':
        seconds = policy['tradingIntervalSeconds'] if market_open(market, now) else policy['closedIntervalSeconds']
        candidate = now + timedelta(seconds=seconds)
        # A closed-session interval must never skip the next opening bell.
        zone = ZoneInfo('America/New_York' if market.lower() == 'us' else 'Asia/Shanghai')
        local = now.astimezone(zone)
        openings = [(9, 30)] if market.lower() == 'us' else [(9, 30), (13, 0)]
        for offset in range(8):
            day = local + timedelta(days=offset)
            if day.weekday() >= 5:
                continue
            for hour, minute in openings:
                opening = day.replace(hour=hour, minute=minute, second=0, microsecond=0).astimezone(timezone.utc)
                if now < opening < candidate:
                    candidate = opening
        return candidate
    local = now.astimezone(ZoneInfo('Asia/Shanghai'))
    for offset in range(8):
        day = local + timedelta(days=offset)
        if policy.get('weekdaysOnly') and day.weekday() >= 5:
            continue
        for time in sorted(policy['dailyTimes']):
            hour, minute = map(int, time.split(':'))
            candidate = day.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if candidate > local:
                return candidate.astimezone(timezone.utc)
    return now + timedelta(days=1)
