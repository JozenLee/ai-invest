import re


def canonical_stock_code(value):
    value = str(value or '').strip().lower()
    if value.endswith('.hk') or re.fullmatch(r'hk\d+', value):
        digits = value.removeprefix('hk').removesuffix('.hk')
        return f'{int(digits)}.hk' if digits.isdigit() else value
    return re.sub(r'\.(sh|sz|bj|us|o|n)$', '', re.sub(r'^(sh|sz|bj)(?=\d)', '', value))


def stock_market(code):
    code = canonical_stock_code(code)
    if code.endswith('.hk'):
        return 'hk'
    return 'cn' if re.fullmatch(r'\d{6}', code) else 'us'


def provider_symbol(code, provider='yfinance'):
    code = canonical_stock_code(code)
    if code.endswith('.hk'):
        width = 5 if provider in ('tushare', 'akshare') else 4
        digits = code[:-3].zfill(width)
        return digits if provider == 'akshare' else f'{digits}.HK'
    return code.upper()
