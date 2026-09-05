from datetime import datetime, timezone

from services.subscription_config import DEFAULTS, market_open, next_run, parse_timestamp


def test_parse_prisma_epoch_and_iso_timestamps():
    value = datetime(2026, 9, 3, 0, 0, tzinfo=timezone.utc)
    assert parse_timestamp(int(value.timestamp() * 1000)) == value
    assert parse_timestamp('2026-09-03T00:00:00Z') == value


def test_daily_bar_policy_runs_twice_and_skips_weekends():
    policy = DEFAULTS['policies']['index_daily']
    assert next_run(policy, datetime(2026, 9, 4, 2, 0, tzinfo=timezone.utc)).hour == 4
    result = next_run(policy, datetime(2026, 9, 4, 10, 0, tzinfo=timezone.utc))
    assert result.weekday() == 0
    assert (result.hour, result.minute) == (4, 10)


def test_foreign_markets_have_separate_trading_sessions():
    now = datetime(2026, 9, 3, 7, 30, tzinfo=timezone.utc)
    assert market_open('hk', now)
    assert not market_open('cn', now)
    assert not market_open('us', now)
    assert market_open('us', datetime(2026, 9, 3, 15, 0, tzinfo=timezone.utc))


def test_closed_interval_cannot_skip_open_or_afternoon_resume():
    policy = DEFAULTS['policies']['etf_realtime']
    assert next_run(policy, datetime(2026, 9, 4, 0, 0, tzinfo=timezone.utc)) == datetime(2026, 9, 4, 1, 30, tzinfo=timezone.utc)
    assert next_run(policy, datetime(2026, 9, 4, 4, 0, tzinfo=timezone.utc)) == datetime(2026, 9, 4, 5, 0, tzinfo=timezone.utc)
    assert market_open('US', datetime(2026, 9, 3, 15, 0, tzinfo=timezone.utc))
