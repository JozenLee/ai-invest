#!/usr/bin/env bash
exec "$(cd "$(dirname "$0")" && pwd)/services.sh" restart data
