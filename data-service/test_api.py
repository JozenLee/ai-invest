import os
from dotenv import load_dotenv

load_dotenv()

print(f"ANTHROPIC_API_KEY: {os.getenv('ANTHROPIC_API_KEY')[:20]}..." if os.getenv('ANTHROPIC_API_KEY') else "Not set")
print(f"ANTHROPIC_BASE_URL: {os.getenv('ANTHROPIC_BASE_URL')}")
print(f"CLAUDE_MODEL: {os.getenv('CLAUDE_MODEL')}")
