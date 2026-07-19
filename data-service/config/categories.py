"""
新闻分类配置 - Python版本

这个文件与前端的 src/config/categories.ts 保持同步
任何分类的修改都应该同时更新两边
"""

from typing import List, Dict, Tuple
from dataclasses import dataclass

# ==================== 分类定义 ====================

@dataclass
class CategoryDefinition:
    """分类定义"""
    code: str           # 分类代码（与AI输出一致）
    id: str             # 数据库ID
    name: str           # 中文名称
    description: str    # 分类描述
    keywords: List[str] # AI识别关键词
    group: str          # 所属分组
    sort_order: int     # 排序权重


@dataclass
class CategoryGroupInfo:
    """分组信息"""
    key: str
    name: str
    description: str
    sort_order: int


# ==================== 分组配置 ====================

CATEGORY_GROUPS: Dict[str, CategoryGroupInfo] = {
    'tech': CategoryGroupInfo(
        key='tech',
        name='科技类',
        description='科技、产品、创新相关',
        sort_order=1
    ),
    'finance': CategoryGroupInfo(
        key='finance',
        name='财经类',
        description='财报、资本、经济相关',
        sort_order=2
    ),
    'industry': CategoryGroupInfo(
        key='industry',
        name='产业类',
        description='供应链、产能、竞争相关',
        sort_order=3
    ),
    'policy': CategoryGroupInfo(
        key='policy',
        name='政策类',
        description='政策、监管、政府相关',
        sort_order=4
    ),
    'international': CategoryGroupInfo(
        key='international',
        name='国际类',
        description='地缘、贸易、全球市场',
        sort_order=5
    ),
    'society': CategoryGroupInfo(
        key='society',
        name='其他',
        description='社会、消费、生活相关',
        sort_order=6
    ),
}


# ==================== 所有分类配置 ====================

CATEGORIES: List[CategoryDefinition] = [
    # ========== 科技类 (5个) ==========
    CategoryDefinition(
        code='ai',
        id='cat_ai',
        name='人工智能',
        description='大模型、深度学习、机器学习',
        keywords=['人工智能', 'AI', '大模型', '深度学习', '机器学习'],
        group='tech',
        sort_order=1
    ),
    CategoryDefinition(
        code='chip',
        id='cat_chip',
        name='芯片半导体',
        description='芯片、半导体、GPU、CPU',
        keywords=['芯片', '半导体', 'GPU', 'CPU', '晶圆'],
        group='tech',
        sort_order=2
    ),
    CategoryDefinition(
        code='internet',
        id='cat_internet',
        name='互联网',
        description='电商、社交、游戏、云计算',
        keywords=['互联网', '电商', '社交', '游戏', '云计算', 'SaaS'],
        group='tech',
        sort_order=3
    ),
    CategoryDefinition(
        code='product',
        id='cat_product',
        name='产品发布',
        description='新品发布、产品推出',
        keywords=['发布', '新品', '产品', '推出'],
        group='tech',
        sort_order=4
    ),
    CategoryDefinition(
        code='breakthrough',
        id='cat_breakthrough',
        name='技术突破',
        description='技术创新、研发突破',
        keywords=['技术', '突破', '研发', '创新'],
        group='tech',
        sort_order=5
    ),

    # ========== 财经类 (4个) ==========
    CategoryDefinition(
        code='earnings',
        id='cat_earnings',
        name='财报业绩',
        description='财报、业绩、营收、利润',
        keywords=['财报', '业绩', '营收', '利润', '净利润'],
        group='finance',
        sort_order=1
    ),
    CategoryDefinition(
        code='merger',
        id='cat_merger',
        name='合作并购',
        description='合作、并购、收购、战略',
        keywords=['合作', '并购', '收购', '战略', '投资'],
        group='finance',
        sort_order=2
    ),
    CategoryDefinition(
        code='capital',
        id='cat_capital',
        name='资本市场',
        description='上市、IPO、融资、股市',
        keywords=['上市', 'IPO', '融资', '股市', '股价'],
        group='finance',
        sort_order=3
    ),
    CategoryDefinition(
        code='macro',
        id='cat_macro',
        name='宏观经济',
        description='GDP、CPI、央行、货币政策',
        keywords=['GDP', 'CPI', '央行', '货币', '经济'],
        group='finance',
        sort_order=4
    ),

    # ========== 产业类 (5个) ==========
    CategoryDefinition(
        code='supply',
        id='cat_supply',
        name='供应链',
        description='供应、出货、订单',
        keywords=['供应', '供应链', '出货', '订单'],
        group='industry',
        sort_order=1
    ),
    CategoryDefinition(
        code='capacity',
        id='cat_capacity',
        name='产能扩张',
        description='扩产、建厂、投产、产能',
        keywords=['扩产', '建厂', '投产', '产能'],
        group='industry',
        sort_order=2
    ),
    CategoryDefinition(
        code='competition',
        id='cat_competition',
        name='竞争格局',
        description='市场份额、竞争、格局',
        keywords=['市场份额', '竞争', '格局'],
        group='industry',
        sort_order=3
    ),
    CategoryDefinition(
        code='new_energy',
        id='cat_new_energy',
        name='新能源',
        description='光伏、风电、电动车、锂电',
        keywords=['新能源', '光伏', '风电', '电动车', '锂电'],
        group='industry',
        sort_order=4
    ),
    CategoryDefinition(
        code='medical',
        id='cat_medical',
        name='医药医疗',
        description='医药、医疗、创新药、疫苗',
        keywords=['医药', '医疗', '创新药', '疫苗'],
        group='industry',
        sort_order=5
    ),

    # ========== 政策类 (3个) ==========
    CategoryDefinition(
        code='policy',
        id='cat_policy',
        name='政策法规',
        description='产业政策、补贴、规划',
        keywords=['政策', '补贴', '规划', '意见'],
        group='policy',
        sort_order=1
    ),
    CategoryDefinition(
        code='regulation',
        id='cat_regulation',
        name='监管制裁',
        description='监管、制裁、管制、限制',
        keywords=['制裁', '管制', '限制', '出口管制', '监管'],
        group='policy',
        sort_order=2
    ),
    CategoryDefinition(
        code='government',
        id='cat_government',
        name='政府动态',
        description='政府、国务院、部委',
        keywords=['政府', '国务院', '部委', '发改委'],
        group='policy',
        sort_order=3
    ),

    # ========== 国际类 (3个) ==========
    CategoryDefinition(
        code='geopolitics',
        id='cat_geopolitics',
        name='地缘政治',
        description='地缘、冲突、外交',
        keywords=['地缘', '冲突', '战争', '外交'],
        group='international',
        sort_order=1
    ),
    CategoryDefinition(
        code='global_market',
        id='cat_global_market',
        name='全球市场',
        description='海外市场、国际市场',
        keywords=['海外', '美股', '欧洲', '日本', '市场', '全球'],
        group='international',
        sort_order=2
    ),
    CategoryDefinition(
        code='trade',
        id='cat_trade',
        name='国际贸易',
        description='贸易、进出口、关税',
        keywords=['贸易', '进出口', '关税'],
        group='international',
        sort_order=3
    ),

    # ========== 社会类 (2个) ==========
    CategoryDefinition(
        code='event',
        id='cat_event',
        name='社会事件',
        description='突发事件、事故',
        keywords=['事故', '灾害', '突发'],
        group='society',
        sort_order=1
    ),
    CategoryDefinition(
        code='consume',
        id='cat_consume',
        name='消费生活',
        description='消费、零售、购物',
        keywords=['消费', '零售', '购物', '生活'],
        group='society',
        sort_order=2
    ),
]


# ==================== 辅助函数 ====================

def get_categories_by_group() -> Dict[str, List[CategoryDefinition]]:
    """按分组整理分类"""
    result: Dict[str, List[CategoryDefinition]] = {key: [] for key in CATEGORY_GROUPS.keys()}

    for cat in CATEGORIES:
        if cat.group in result:
            result[cat.group].append(cat)

    # 排序
    for group in result.values():
        group.sort(key=lambda x: x.sort_order)

    return result


def get_all_category_codes() -> List[str]:
    """获取所有分类代码（用于AI Prompt）"""
    return [cat.code for cat in CATEGORIES]


def get_all_category_ids() -> List[str]:
    """获取所有分类ID（用于数据库查询）"""
    return [cat.id for cat in CATEGORIES]


def get_category_by_code(code: str):
    """通过代码查找分类"""
    for cat in CATEGORIES:
        if cat.code == code:
            return cat
    return None


def get_category_by_id(cat_id: str):
    """通过ID查找分类"""
    for cat in CATEGORIES:
        if cat.id == cat_id:
            return cat
    return None


def get_category_keyword_map() -> Dict[str, List[str]]:
    """获取分类的关键词映射（用于后端映射）"""
    return {cat.code: cat.keywords for cat in CATEGORIES}


def generate_ai_category_prompt() -> str:
    """生成AI Prompt的分类描述"""
    grouped = get_categories_by_group()
    prompt = '从以下22个类别中选择最合适的一个：\n\n'

    # 按分组顺序
    for group_key in sorted(CATEGORY_GROUPS.keys(), key=lambda x: CATEGORY_GROUPS[x].sort_order):
        group = CATEGORY_GROUPS[group_key]
        categories = grouped[group_key]

        prompt += f'{group.name}:\n'
        for cat in categories:
            prompt += f'- {cat.code}: {cat.description}\n'
        prompt += '\n'

    return prompt


def get_valid_category_codes() -> List[str]:
    """获取有效的分类代码列表（用于验证）"""
    return get_all_category_codes()


# ==================== 导出快捷访问 ====================

# 分类代码列表（用于AI验证）
VALID_CATEGORY_CODES = get_all_category_codes()

# 分类关键词映射（用于降级匹配）
CATEGORY_KEYWORD_MAP = get_category_keyword_map()

# AI Prompt文本（用于AI分类）
AI_CATEGORY_PROMPT = generate_ai_category_prompt()
