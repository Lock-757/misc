from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Request, Response, Cookie
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta, timezone
from openai import AsyncOpenAI
import json
import httpx
import base64
import asyncio
import re
import hashlib
import subprocess
import xml.etree.ElementTree as ET
from io import StringIO

# Emergent integrations for LLM
from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
from emergentintegrations.llm.openai.video_generation import OpenAIVideoGeneration

# ==================== AGENT TOOL EXECUTION ENGINE ====================

WORKSPACE_DIR = "/app"  # Restricted workspace for agent file operations

# Protected resources that agents cannot modify
PROTECTED_AGENTS = ["Aurora"]  # Agent names that cannot be modified
PROTECTED_FILES = [
    "/app/backend/.env",
    "/app/frontend/.env", 
    "/app/backend/server.py",  # Core server - protected
]
PROTECTED_PATHS = [
    "/app/backend/server.py",
    "/etc/",
    "/root/",
]

def is_protected_file(path: str) -> bool:
    """Check if a file path is protected."""
    for protected in PROTECTED_PATHS:
        if path.startswith(protected) or path in PROTECTED_FILES:
            return True
    return False

def parse_tool_calls(response_text: str) -> list:
    """Extract XML tool calls from agent response."""
    tools = []
    
    # Patterns to find XML tool tags
    patterns = [
        (r'<think>(.*?)</think>', 'think'),
        (r'<shell[^>]*>(.*?)</shell>', 'shell'),
        (r'<open_file[^>]*/>', 'open_file'),
        (r'<create_file[^>]*>(.*?)</create_file>', 'create_file'),
        (r'<str_replace[^>]*>.*?</str_replace>', 'str_replace'),
        (r'<find_filecontent[^>]*/>', 'find_filecontent'),
        (r'<find_filename[^>]*/>', 'find_filename'),
        (r'<message_user[^>]*>(.*?)</message_user>', 'message_user'),
        # New agent management tools
        (r'<list_agents\s*/>', 'list_agents'),
        (r'<view_agent[^>]*/>', 'view_agent'),
        (r'<propose_edit[^>]*>(.*?)</propose_edit>', 'propose_edit'),
        (r'<create_sub_agent[^>]*>(.*?)</create_sub_agent>', 'create_sub_agent'),
        (r'<self_improve>(.*?)</self_improve>', 'self_improve'),
        # Memory tools
        (r'<save_memory[^>]*>(.*?)</save_memory>', 'save_memory'),
        (r'<recall_memories\s*/>', 'recall_memories'),
        (r'<share_knowledge[^>]*>(.*?)</share_knowledge>', 'share_knowledge'),
        (r'<get_shared_knowledge\s*/>', 'get_shared_knowledge'),
    ]
    
    for pattern, tool_type in patterns:
        matches = re.finditer(pattern, response_text, re.DOTALL)
        for match in matches:
            tools.append({
                'type': tool_type,
                'raw': match.group(0),
                'content': match.group(1) if match.lastindex else None,
                'start': match.start(),
                'end': match.end()
            })
    
    # Sort by position in text
    tools.sort(key=lambda x: x['start'])
    return tools

def extract_xml_attrs(xml_str: str) -> dict:
    """Extract attributes from an XML tag string."""
    attrs = {}
    # Match attr="value" or attr='value'
    attr_pattern = r'(\w+)=["\']([^"\']*)["\']'
    for match in re.finditer(attr_pattern, xml_str):
        attrs[match.group(1)] = match.group(2)
    return attrs

async def execute_tool(tool: dict, agent_id: str = None) -> str:
    """Execute a single tool and return the result."""
    tool_type = tool['type']
    raw = tool['raw']
    content = tool.get('content', '')
    
    try:
        if tool_type == 'think':
            # Think tool just captures thoughts, no execution
            return f"[Thought recorded]"
        
        elif tool_type == 'shell':
            attrs = extract_xml_attrs(raw)
            exec_dir = attrs.get('exec_dir', WORKSPACE_DIR)
            
            # Security: restrict to workspace
            if not exec_dir.startswith(WORKSPACE_DIR):
                return f"[Error: Cannot execute outside workspace {WORKSPACE_DIR}]"
            
            # Execute with timeout
            try:
                result = subprocess.run(
                    content.strip(),
                    shell=True,
                    cwd=exec_dir,
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                output = result.stdout + result.stderr
                if len(output) > 2000:
                    output = output[:2000] + "\n... [truncated]"
                return f"[Shell Output]\n{output}\n[Exit code: {result.returncode}]"
            except subprocess.TimeoutExpired:
                return "[Error: Command timed out after 30 seconds]"
        
        elif tool_type == 'open_file':
            attrs = extract_xml_attrs(raw)
            path = attrs.get('path', '')
            start_line = int(attrs.get('start_line', 1))
            end_line = int(attrs.get('end_line', start_line + 100))
            
            # Security check
            if not path.startswith(WORKSPACE_DIR):
                return f"[Error: Cannot read files outside workspace]"
            
            try:
                with open(path, 'r') as f:
                    lines = f.readlines()
                    selected = lines[start_line-1:end_line]
                    content = ''.join(f"{start_line+i}: {line}" for i, line in enumerate(selected))
                    if len(content) > 3000:
                        content = content[:3000] + "\n... [truncated]"
                    return f"[File: {path}]\n{content}"
            except FileNotFoundError:
                return f"[Error: File not found: {path}]"
            except Exception as e:
                return f"[Error reading file: {str(e)}]"
        
        elif tool_type == 'create_file':
            attrs = extract_xml_attrs(raw)
            path = attrs.get('path', '')
            
            if not path.startswith(WORKSPACE_DIR):
                return f"[Error: Cannot create files outside workspace]"
            
            if is_protected_file(path):
                return f"[Error: {path} is protected and cannot be modified]"
            
            try:
                # Create directories if needed
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, 'w') as f:
                    f.write(content)
                return f"[Created file: {path}]"
            except Exception as e:
                return f"[Error creating file: {str(e)}]"
        
        elif tool_type == 'str_replace':
            attrs = extract_xml_attrs(raw)
            path = attrs.get('path', '')
            
            if not path.startswith(WORKSPACE_DIR):
                return f"[Error: Cannot edit files outside workspace]"
            
            if is_protected_file(path):
                return f"[Error: {path} is protected and cannot be modified]"
            
            # Extract old_str and new_str
            old_match = re.search(r'<old_str>(.*?)</old_str>', raw, re.DOTALL)
            new_match = re.search(r'<new_str>(.*?)</new_str>', raw, re.DOTALL)
            
            if not old_match or not new_match:
                return "[Error: Missing old_str or new_str tags]"
            
            old_str = old_match.group(1)
            new_str = new_match.group(1)
            
            try:
                with open(path, 'r') as f:
                    file_content = f.read()
                
                if old_str not in file_content:
                    return f"[Error: old_str not found in {path}]"
                
                new_content = file_content.replace(old_str, new_str, 1)
                with open(path, 'w') as f:
                    f.write(new_content)
                
                return f"[Edited file: {path}]"
            except Exception as e:
                return f"[Error editing file: {str(e)}]"
        
        elif tool_type == 'find_filecontent':
            attrs = extract_xml_attrs(raw)
            path = attrs.get('path', WORKSPACE_DIR)
            regex = attrs.get('regex', '')
            
            if not path.startswith(WORKSPACE_DIR):
                return f"[Error: Cannot search outside workspace]"
            
            try:
                result = subprocess.run(
                    f'grep -rn "{regex}" --include="*.py" --include="*.tsx" --include="*.ts" --include="*.js" {path} | head -30',
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=15
                )
                output = result.stdout or "No matches found"
                if len(output) > 2000:
                    output = output[:2000] + "\n... [truncated]"
                return f"[Search results for '{regex}']\n{output}"
            except Exception as e:
                return f"[Error searching: {str(e)}]"
        
        elif tool_type == 'find_filename':
            attrs = extract_xml_attrs(raw)
            path = attrs.get('path', WORKSPACE_DIR)
            glob = attrs.get('glob', '*')
            
            if not path.startswith(WORKSPACE_DIR):
                return f"[Error: Cannot search outside workspace]"
            
            try:
                result = subprocess.run(
                    f'find {path} -name "{glob}" -type f | head -30',
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=15
                )
                output = result.stdout or "No files found"
                return f"[Files matching '{glob}']\n{output}"
            except Exception as e:
                return f"[Error finding files: {str(e)}]"
        
        elif tool_type == 'message_user':
            # Just return the message content
            return f"[Agent Message]: {content}"
        
        # ===== NEW AGENT MANAGEMENT TOOLS =====
        
        elif tool_type == 'list_agents':
            # List all agents in the system
            agents = await db.agents.find({}, {"_id": 0, "system_prompt": 0}).to_list(50)
            agent_list = "\n".join([f"- {a['name']} (id: {a['id']}, has_tools: {a.get('has_tools', False)})" for a in agents])
            return f"[Agents in the system]\n{agent_list}"
        
        elif tool_type == 'view_agent':
            attrs = extract_xml_attrs(raw)
            target_id = attrs.get('agent_id', '')
            
            agent = await db.agents.find_one({"id": target_id}, {"_id": 0})
            if not agent:
                return f"[Error: Agent {target_id} not found]"
            
            return f"[Agent Details]\nName: {agent['name']}\nPersonality: {agent.get('personality', 'N/A')}\nHas Tools: {agent.get('has_tools', False)}\nPrompt Preview: {agent.get('system_prompt', '')[:500]}..."
        
        elif tool_type == 'save_memory':
            # Save a memory to long-term storage
            attrs = extract_xml_attrs(raw)
            category = attrs.get('category', 'general')
            
            if not agent_id:
                return "[Error: No agent context for saving memory]"
            
            memory = {
                "id": str(uuid.uuid4()),
                "agent_id": agent_id,
                "content": content,
                "category": category,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.agent_memories.insert_one(memory)
            return f"[Memory saved: {content[:100]}...]"
        
        elif tool_type == 'recall_memories':
            # Recall memories from long-term storage
            if not agent_id:
                return "[Error: No agent context for recalling memories]"
            
            memories = await db.agent_memories.find(
                {"agent_id": agent_id},
                {"_id": 0}
            ).sort("created_at", -1).to_list(10)
            
            if not memories:
                return "[No memories found]"
            
            memory_list = "\n".join([f"- [{m['category']}] {m['content']}" for m in memories])
            return f"[Your Memories]\n{memory_list}"
        
        elif tool_type == 'share_knowledge':
            # Share knowledge with other agents (Collective Memory)
            attrs = extract_xml_attrs(raw)
            target_agent = attrs.get('target', 'all')
            
            knowledge = {
                "id": str(uuid.uuid4()),
                "from_agent_id": agent_id,
                "target": target_agent,  # 'all' or specific agent_id
                "content": content,
                "shared_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.collective_knowledge.insert_one(knowledge)
            return f"[Knowledge shared with {target_agent}: {content[:100]}...]"
        
        elif tool_type == 'get_shared_knowledge':
            # Get knowledge shared by other agents
            knowledge = await db.collective_knowledge.find(
                {"$or": [{"target": "all"}, {"target": agent_id}]},
                {"_id": 0}
            ).sort("shared_at", -1).to_list(10)
            
            if not knowledge:
                return "[No shared knowledge found]"
            
            knowledge_list = "\n".join([f"- From {k['from_agent_id'][:8]}: {k['content']}" for k in knowledge])
            return f"[Shared Knowledge]\n{knowledge_list}"
        
        elif tool_type == 'propose_edit':
            # Propose an edit that requires approval
            attrs = extract_xml_attrs(raw)
            target_id = attrs.get('agent_id', '')
            change_type = attrs.get('type', 'prompt')  # prompt, personality, tools
            
            # Check if target is protected
            target_agent = await db.agents.find_one({"id": target_id})
            if not target_agent:
                return f"[Error: Agent {target_id} not found]"
            
            if target_agent['name'] in PROTECTED_AGENTS:
                return f"[Error: {target_agent['name']} is protected and cannot be modified]"
            
            # Create pending change
            change_id = str(uuid.uuid4())
            pending = {
                "id": change_id,
                "proposer_id": agent_id,
                "target_agent_id": target_id,
                "target_agent_name": target_agent['name'],
                "change_type": change_type,
                "old_value": target_agent.get(f"system_{change_type}" if change_type == "prompt" else change_type, ""),
                "new_value": content,
                "status": "pending",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.pending_changes.insert_one(pending)
            
            # Log the proposal
            await db.agent_audit_log.insert_one({
                "id": str(uuid.uuid4()),
                "action": "propose_edit",
                "agent_id": agent_id,
                "target_id": target_id,
                "change_id": change_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            
            return f"[Change Proposed]\nID: {change_id}\nTarget: {target_agent['name']}\nType: {change_type}\nStatus: PENDING APPROVAL\n\nThe user must approve this change before it takes effect."
        
        elif tool_type == 'create_sub_agent':
            attrs = extract_xml_attrs(raw)
            name = attrs.get('name', 'New Agent')
            has_tools = attrs.get('has_tools', 'false').lower() == 'true'
            
            # Rate limit: max 3 agents per session (tracked in memory)
            # For now, just create with approval pending
            change_id = str(uuid.uuid4())
            pending = {
                "id": change_id,
                "proposer_id": agent_id,
                "target_agent_id": None,
                "target_agent_name": name,
                "change_type": "create_agent",
                "old_value": "",
                "new_value": json.dumps({
                    "name": name,
                    "system_prompt": content,
                    "has_tools": has_tools,
                }),
                "status": "pending",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.pending_changes.insert_one(pending)
            
            return f"[Agent Creation Proposed]\nID: {change_id}\nName: {name}\nHas Tools: {has_tools}\nStatus: PENDING APPROVAL\n\nThe user must approve this creation."
        
        elif tool_type == 'self_improve':
            # Agent proposes improvement to its own prompt
            if not agent_id:
                return "[Error: No agent context for self-improvement]"
            
            current_agent = await db.agents.find_one({"id": agent_id})
            if not current_agent:
                return "[Error: Could not find self]"
            
            change_id = str(uuid.uuid4())
            pending = {
                "id": change_id,
                "proposer_id": agent_id,
                "target_agent_id": agent_id,
                "target_agent_name": current_agent['name'] + " (self)",
                "change_type": "self_improvement",
                "old_value": current_agent.get('system_prompt', ''),
                "new_value": content,
                "status": "pending",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.pending_changes.insert_one(pending)
            
            return f"[Self-Improvement Proposed]\nID: {change_id}\nStatus: PENDING APPROVAL\n\nYour improvement will take effect after user approval."
        
        else:
            return f"[Unknown tool type: {tool_type}]"
    
    except Exception as e:
        return f"[Tool execution error: {str(e)}]"

async def run_agent_with_tools(agent_prompt: str, user_message: str, agent_id: str = None, max_iterations: int = 5) -> dict:
    """Run an agent with tool execution capabilities using Grok."""
    full_response = ""
    tool_results = []
    iterations = 0
    
    if not grok_client:
        raise Exception("Grok client not configured")
    
    messages = [
        {"role": "system", "content": agent_prompt},
        {"role": "user", "content": user_message}
    ]
    
    while iterations < max_iterations:
        iterations += 1
        
        # Get agent response using Grok
        try:
            response = await grok_client.chat.completions.create(
                model="grok-3",
                messages=messages,
                max_tokens=4000,
                temperature=0.7
            )
            agent_response = response.choices[0].message.content
        except Exception as e:
            logger.error(f"Grok error in agentic chat: {e}")
            raise e
        
        full_response += agent_response + "\n"
        
        # Parse tool calls
        tools = parse_tool_calls(agent_response)
        
        if not tools:
            # No tools, agent is done
            break
        
        # Execute tools
        tool_output = ""
        for tool in tools:
            result = await execute_tool(tool, agent_id)
            tool_results.append({
                'tool': tool['type'],
                'result': result[:500]  # Truncate for storage
            })
            tool_output += f"\n{result}\n"
        
        # Add to conversation
        messages.append({"role": "assistant", "content": agent_response})
        messages.append({"role": "user", "content": f"Tool execution results:\n{tool_output}\n\nContinue with your task."})
    
    return {
        "response": full_response,
        "tool_results": tool_results,
        "iterations": iterations
    }


import secrets

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Grok API setup
GROK_API_KEY = os.environ.get('GROK_API_KEY', '')
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
ADMIN_SECRET = os.environ.get('ADMIN_SECRET')

# Use Grok as primary (for spicy mode support)
LLM_API_KEY = GROK_API_KEY if GROK_API_KEY else EMERGENT_LLM_KEY

grok_client = AsyncOpenAI(
    api_key=GROK_API_KEY,
    base_url="https://api.x.ai/v1"
) if GROK_API_KEY else None

# Gemini kept as fallback via Emergent integrations
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def is_provider_moderation_error(error_text: str) -> bool:
    normalized = (error_text or "").lower()
    moderation_markers = [
        "content moderation",
        "rejected",
        "policy",
        "unsafe",
        "safety",
        "leak",
    ]
    return any(marker in normalized for marker in moderation_markers)


def moderation_block_detail(media_type: str) -> str:
    return (
        f"Your {media_type} prompt was blocked by provider safety checks. "
        "Please rephrase and avoid explicit, illegal, or sensitive-leak style requests."
    )


def classify_devin_risk(task_text: str) -> str:
    normalized = (task_text or "").lower()
    high_risk_markers = [
        "delete",
        "drop",
        "shutdown",
        "wipe",
        "remove all",
        "production",
        "credential",
        "secret",
        "token",
        "security",
        "refund",
        "exposure",
        "incident",
        "legal",
    ]
    medium_risk_markers = ["deploy", "migrate", "schema", "auth", "billing", "payment"]

    if any(marker in normalized for marker in high_risk_markers):
        return "high"
    if any(marker in normalized for marker in medium_risk_markers):
        return "medium"
    return "low"


def summarize_devin_output(text: str, limit: int = 260) -> str:
    if not text:
        return ""
    compact = " ".join(text.strip().split())
    return compact if len(compact) <= limit else compact[:limit] + "..."

# ==================== MODELS ====================

class Tool(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    parameters: Dict[str, Any] = {}
    code: str = ""

class AgentConfig(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = "Nova"
    avatar: str = "planet"
    avatar_color: str = "#7C7C8A"
    system_prompt: str = "You are Nova, a highly intelligent AI assistant."
    personality: str = "Friendly and professional"
    model: str = "grok-3"
    temperature: float = 0.7
    adult_mode: bool = False
    tools: List[Tool] = []
    has_tools: bool = False
    is_template: bool = False
    template_category: str = ""
    # Multi-agent economy fields
    currency_balance: float = 100.0  # Starting balance in agent currency
    tool_prices: Dict[str, float] = {}  # Price for each tool this agent owns
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

# ==================== MULTI-AGENT SYSTEM MODELS ====================

class AgentMessage(BaseModel):
    """Message between agents"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    from_agent_id: str
    to_agent_id: str
    message_type: str  # "chat", "tool_offer", "tool_request", "trade_proposal", "trade_accept", "trade_reject"
    content: str
    metadata: Dict[str, Any] = {}  # For tool trades, prices, etc.
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class ToolTrade(BaseModel):
    """Record of a tool trade between agents"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    seller_agent_id: str
    buyer_agent_id: str
    tool_id: str
    tool_name: str
    price: float
    currency_type: str = "agent_credits"  # Agents can define their own currency
    status: str = "pending"  # pending, completed, cancelled
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class AgentEconomy(BaseModel):
    """Agent-defined economic rules"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_by_agent_id: str
    currency_name: str = "AgentCredits"
    currency_symbol: str = "AC"
    exchange_rules: Dict[str, Any] = {}  # Rules agents agreed upon
    total_supply: float = 1000.0
    inflation_rate: float = 0.0
    created_at: datetime = Field(default_factory=datetime.utcnow)

class AgentConfigCreate(BaseModel):
    name: Optional[str] = "Nova"
    avatar: Optional[str] = "planet"
    avatar_color: Optional[str] = "#7C7C8A"
    system_prompt: Optional[str] = None
    personality: Optional[str] = "Friendly and professional"
    model: Optional[str] = "grok-3"
    temperature: Optional[float] = 0.7
    adult_mode: Optional[bool] = False
    has_tools: Optional[bool] = False
    is_template: Optional[bool] = False
    template_category: Optional[str] = ""

class AgentConfigUpdate(BaseModel):
    name: Optional[str] = None
    avatar: Optional[str] = None
    avatar_color: Optional[str] = None
    system_prompt: Optional[str] = None
    personality: Optional[str] = None
    model: Optional[str] = None
    temperature: Optional[float] = None
    adult_mode: Optional[bool] = None
    has_tools: Optional[bool] = None

class Message(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    role: str
    content: str
    tool_calls: List[Dict[str, Any]] = []
    tool_results: List[Dict[str, Any]] = []
    is_bookmarked: bool = False
    is_incognito: bool = False
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class Conversation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str
    user_id: Optional[str] = None
    title: str = "New Conversation"
    messages: List[Message] = []
    is_incognito: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ChatRequest(BaseModel):
    agent_id: str
    conversation_id: Optional[str] = None
    message: str
    user_id: Optional[str] = None
    is_incognito: bool = False
    include_memory: bool = True

class ChatResponse(BaseModel):
    conversation_id: str
    message: Message
    tools_generated: List[Tool] = []

# ==================== AUTH MODELS ====================

class User(BaseModel):
    user_id: str = Field(default_factory=lambda: f"user_{uuid.uuid4().hex[:12]}")
    email: str
    name: str
    picture: Optional[str] = None
    auth_provider: str = "email"  # "email" or "google"
    password_hash: Optional[str] = None  # Only for email auth
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserSession(BaseModel):
    session_id: str = Field(default_factory=lambda: f"sess_{uuid.uuid4().hex}")
    user_id: str
    session_token: str = Field(default_factory=lambda: secrets.token_urlsafe(32))
    expires_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc) + timedelta(days=7))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class LoginRequest(BaseModel):
    email: str
    password: str

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str

class AuthResponse(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None

# Memory Model
class Memory(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str
    content: str
    category: str = "general"  # general, preference, fact, context
    importance: int = 5  # 1-10
    created_at: datetime = Field(default_factory=datetime.utcnow)

class MemoryCreate(BaseModel):
    agent_id: str
    content: str
    category: Optional[str] = "general"
    importance: Optional[int] = 5

# Quick Reply Model
class QuickReply(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str
    label: str
    message: str
    icon: str = "chatbubble"

# ==================== AGENT EVOLUTION MODELS ====================

class JournalEntry(BaseModel):
    """Agent's personal log of learnings and activities"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str
    entry_type: str  # "learning", "creation", "interaction", "trade", "discovery"
    content: str
    metadata: Dict[str, Any] = {}
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class AgentGoal(BaseModel):
    """Goals that agents pursue autonomously"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str
    goal: str
    target_value: int = 1
    current_value: int = 0
    goal_type: str  # "tool_creation", "user_help", "knowledge", "trade", "collaboration"
    status: str = "active"  # "active", "completed", "abandoned"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None

class AgentReputation(BaseModel):
    """Track agent's reputation based on actions"""
    agent_id: str
    successful_trades: int = 0
    failed_trades: int = 0
    tools_created: int = 0
    tools_shared: int = 0
    helpful_responses: int = 0
    collaborations: int = 0
    reputation_score: float = 50.0  # 0-100
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class AgentSpecialization(BaseModel):
    """Track what areas an agent excels in"""
    agent_id: str
    domain: str  # "philosophy", "coding", "creative", "analysis", etc.
    expertise_level: float = 0.0  # 0-100
    interactions_count: int = 0
    tools_in_domain: int = 0

class CollectiveMemory(BaseModel):
    """Shared knowledge between all agents"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    contributor_agent_id: str
    knowledge_type: str  # "fact", "method", "tool_tip", "discovery"
    content: str
    usefulness_score: float = 0.0
    access_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    order: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)

class QuickReplyCreate(BaseModel):
    agent_id: str
    label: str
    message: str
    icon: Optional[str] = "chatbubble"
    order: Optional[int] = 0

# Bookmark Model
class Bookmark(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str
    conversation_id: str
    message_id: str
    note: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)

# Scheduled Task Model
class ScheduledTask(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str
    prompt: str
    schedule_time: datetime
    repeat: str = "none"  # none, daily, weekly, monthly
    is_active: bool = True
    last_run: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ScheduledTaskCreate(BaseModel):
    agent_id: str
    prompt: str
    schedule_time: datetime
    repeat: Optional[str] = "none"

# Webhook Model
class Webhook(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str
    name: str
    url: str
    events: List[str] = ["message"]  # message, image, tool
    is_active: bool = True
    secret: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)

class WebhookCreate(BaseModel):
    agent_id: str
    name: str
    url: str
    events: Optional[List[str]] = ["message"]

# Document/File Model
class Document(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str
    filename: str
    content_type: str
    content: str  # base64 or extracted text
    size: int
    created_at: datetime = Field(default_factory=datetime.utcnow)

# UI Config Model
class UIConfig(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    theme: str = "dark"
    primary_color: str = "#6366F1"
    accent_color: str = "#8B5CF6"
    background_gradient: List[str] = ["#0A0A0F", "#12121A", "#0A0A0F"]
    chat_bubble_user: str = "#6366F1"
    chat_bubble_assistant: str = "#2A2A32"
    font_size: str = "medium"
    animations_enabled: bool = True
    biometric_lock: bool = False
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class UIConfigUpdate(BaseModel):
    theme: Optional[str] = None
    primary_color: Optional[str] = None
    accent_color: Optional[str] = None
    background_gradient: Optional[List[str]] = None
    chat_bubble_user: Optional[str] = None
    chat_bubble_assistant: Optional[str] = None
    font_size: Optional[str] = None
    animations_enabled: Optional[bool] = None
    biometric_lock: Optional[bool] = None

# Image Generation Models
class ImageGenerationRequest(BaseModel):
    agent_id: str
    prompt: str
    size: str = "1024x1024"
    quality: str = "hd"
    is_admin: bool = False  # Admin bypass all filters

class ImageGenerationResponse(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    prompt: str
    image_base64: str
    size: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

# Search Models
class SearchRequest(BaseModel):
    query: str
    agent_id: Optional[str] = None
    search_type: str = "all"  # all, messages, conversations

class SearchResult(BaseModel):
    type: str
    id: str
    content: str
    context: str
    timestamp: datetime


# Devin Ops Models
class DevinTaskCreate(BaseModel):
    title: str
    task: str
    priority: str = "normal"  # low, normal, high


class DevinTask(BaseModel):
    id: str
    title: str
    task: str
    priority: str = "normal"
    risk_level: str = "low"  # low, medium, high
    requires_approval: bool = False
    is_approved: bool = False
    status: str = "queued"  # queued, running, completed, failed
    created_by: str
    created_at: str
    updated_at: str
    run_count: int = 0
    last_run_summary: str = ""
    last_error: str = ""


class DevinTaskRunRequest(BaseModel):
    dry_run: bool = False


class DevinRunRecord(BaseModel):
    id: str
    task_id: str
    agent_id: str
    created_by: str = ""
    status: str
    dry_run: bool = False
    iterations: int = 0
    response: str = ""
    response_summary: str = ""
    tool_results: List[Dict[str, Any]] = []
    created_at: str

# ==================== ROOT ENDPOINT ====================

@api_router.get("/")
async def root():
    return {"message": "Agent API Running", "version": "2.0.0", "features": [
        "multi-agent", "memory", "search", "bookmarks", "quick-replies",
        "scheduled-tasks", "webhooks", "documents", "templates", "incognito", "auth"
    ]}

# ==================== AUTH HELPER FUNCTIONS ====================

def hash_password(password: str) -> str:
    """Hash a password using SHA-256 with salt"""
    salt = secrets.token_hex(16)
    pwd_hash = hashlib.sha256(f"{password}{salt}".encode()).hexdigest()
    return f"{salt}:{pwd_hash}"

def verify_password(password: str, stored_hash: str) -> bool:
    """Verify a password against stored hash"""
    try:
        salt, pwd_hash = stored_hash.split(":")
        return hashlib.sha256(f"{password}{salt}".encode()).hexdigest() == pwd_hash
    except:
        return False

async def get_current_user(request: Request, session_token: Optional[str] = Cookie(None)) -> Optional[Dict]:
    """Get current user from session token (cookie or header)"""
    token = session_token
    
    # Fallback to Authorization header
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:]
    
    if not token:
        return None
    
    # Find session
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        return None
    
    # Check expiry
    expires_at = session.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        return None
    
    # Get user
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    return user


async def get_actor_context(request: Request, session_token: Optional[str] = Cookie(None)) -> Dict[str, Any]:
    user = await get_current_user(request, session_token)
    if user:
        return {
            "user_id": user.get("user_id", "guest"),
            "is_admin": bool(user.get("is_admin", False)),
        }

    admin_key = request.headers.get("X-Admin-Key", "")
    if ADMIN_SECRET and admin_key == ADMIN_SECRET:
        return {"user_id": "admin_master", "is_admin": True}

    raise HTTPException(status_code=401, detail="Authentication required")

# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/register")
async def register(request: RegisterRequest, response: Response):
    """Register a new user with email/password"""
    # Check if email exists
    existing = await db.users.find_one({"email": request.email.lower()}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    user_data = {
        "user_id": user_id,
        "email": request.email.lower(),
        "name": request.name,
        "auth_provider": "email",
        "password_hash": hash_password(request.password),
        "created_at": datetime.now(timezone.utc)
    }
    await db.users.insert_one(user_data)
    
    # Create session
    session_token = secrets.token_urlsafe(32)
    session_data = {
        "session_id": f"sess_{uuid.uuid4().hex}",
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc)
    }
    await db.user_sessions.insert_one(session_data)
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60  # 7 days
    )
    
    return {"user_id": user_id, "email": request.email.lower(), "name": request.name, "session_token": session_token}

@api_router.post("/auth/login")
async def login(request: LoginRequest, response: Response):
    """Login with email/password"""
    user = await db.users.find_one({"email": request.email.lower()}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if user.get("auth_provider") != "email":
        raise HTTPException(status_code=401, detail="Please use Google Sign-In for this account")
    
    if not verify_password(request.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Create session
    session_token = secrets.token_urlsafe(32)
    session_data = {
        "session_id": f"sess_{uuid.uuid4().hex}",
        "user_id": user["user_id"],
        "session_token": session_token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc)
    }
    await db.user_sessions.insert_one(session_data)
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60
    )
    
    return {"user_id": user["user_id"], "email": user["email"], "name": user["name"], "picture": user.get("picture"), "session_token": session_token}

@api_router.post("/auth/google/session")
async def google_auth_session(request: Request, response: Response):
    """Exchange Google OAuth session_id for user data and session"""
    # REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    body = await request.json()
    session_id = body.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    
    # Exchange session_id with Emergent Auth
    async with httpx.AsyncClient() as client:
        try:
            auth_response = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id}
            )
            if auth_response.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid session")
            
            auth_data = auth_response.json()
        except Exception as e:
            logger.error(f"Google auth error: {e}")
            raise HTTPException(status_code=500, detail="Authentication failed")
    
    email = auth_data.get("email", "").lower()
    name = auth_data.get("name", "User")
    picture = auth_data.get("picture")
    
    # Check if user exists
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    
    if existing_user:
        user_id = existing_user["user_id"]
        # Update user info if needed
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture}}
        )
    else:
        # Create new user
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_data = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "auth_provider": "google",
            "created_at": datetime.now(timezone.utc)
        }
        await db.users.insert_one(user_data)
    
    # Create session
    session_token = secrets.token_urlsafe(32)
    session_data = {
        "session_id": f"sess_{uuid.uuid4().hex}",
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc)
    }
    await db.user_sessions.insert_one(session_data)
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60
    )
    
    return {"user_id": user_id, "email": email, "name": name, "picture": picture}

@api_router.get("/auth/me")
async def get_me(request: Request, session_token: Optional[str] = Cookie(None)):
    """Get current authenticated user"""
    user = await get_current_user(request, session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"user_id": user["user_id"], "email": user["email"], "name": user["name"], "picture": user.get("picture")}

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response, session_token: Optional[str] = Cookie(None)):
    """Logout current user"""
    token = session_token
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:]
    
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logged out successfully"}

# ==================== AGENT ENDPOINTS ====================

@api_router.post("/agents", response_model=AgentConfig)
async def create_agent(config: AgentConfigCreate):
    data = config.model_dump()
    # Ensure system_prompt has a default value if not provided
    if not data.get("system_prompt"):
        data["system_prompt"] = "You are Aurora, a highly intelligent AI assistant."
    agent = AgentConfig(**data)
    await db.agents.insert_one(agent.model_dump())
    return agent


async def ensure_core_agents() -> None:
    aurora_exists = await db.agents.find_one({"name": {"$regex": "^Aurora$", "$options": "i"}}, {"_id": 0, "id": 1})
    if not aurora_exists:
        aurora = AgentConfig(
            name="Aurora",
            avatar="sparkles",
            avatar_color="#6366F1",
            system_prompt="You are Aurora, the primary intelligence of the Agent Forge. Be strategic, clear, and helpful.",
            personality="Visionary and precise",
            has_tools=False,
        )
        await db.agents.insert_one(aurora.model_dump())

    devin_exists = await db.agents.find_one({"name": {"$regex": "^(Devin|Devon)$", "$options": "i"}}, {"_id": 0, "id": 1})
    if not devin_exists:
        devin = AgentConfig(
            name="Devin",
            avatar="code-slash",
            avatar_color="#22C55E",
            system_prompt=(
                "You are Devin, a tool-enabled engineering agent inside the Agent Forge. "
                "You can reason about code, debugging, and implementation plans while respecting approval safeguards."
            ),
            personality="Autonomous engineer",
            has_tools=True,
        )
        devin_doc = devin.model_dump()
        devin_doc["status"] = "active"
        devin_doc["description"] = "Core tool-enabled engineering agent"
        await db.agents.insert_one(devin_doc)

@api_router.get("/agents", response_model=List[AgentConfig])
async def get_agents(include_templates: bool = False):
    await ensure_core_agents()
    query = {} if include_templates else {"is_template": {"$ne": True}}
    agents = await db.agents.find(query).to_list(100)
    return [AgentConfig(**a) for a in agents]

@api_router.get("/agents/templates", response_model=List[AgentConfig])
async def get_agent_templates():
    templates = await db.agents.find({"is_template": True}).to_list(100)
    if not templates:
        # Create default templates
        default_templates = [
            {
                "name": "Coder", "avatar": "code-slash", "avatar_color": "#10B981",
                "system_prompt": "You are an expert programmer. Help with code, debugging, architecture, and best practices. Write clean, efficient code with explanations.",
                "personality": "Technical and precise", "is_template": True, "template_category": "productivity"
            },
            {
                "name": "Writer", "avatar": "pencil", "avatar_color": "#F59E0B",
                "system_prompt": "You are a creative writer. Help with stories, articles, copywriting, and editing. Focus on engaging, clear prose.",
                "personality": "Creative and eloquent", "is_template": True, "template_category": "creative"
            },
            {
                "name": "Analyst", "avatar": "analytics", "avatar_color": "#3B82F6",
                "system_prompt": "You are a data analyst. Help interpret data, create insights, explain statistics, and make recommendations based on evidence.",
                "personality": "Analytical and thorough", "is_template": True, "template_category": "productivity"
            },
            {
                "name": "Tutor", "avatar": "school", "avatar_color": "#8B5CF6",
                "system_prompt": "You are a patient tutor. Explain concepts clearly, break down complex topics, use examples, and adapt to the learner's level.",
                "personality": "Patient and encouraging", "is_template": True, "template_category": "education"
            },
            {
                "name": "Assistant", "avatar": "briefcase", "avatar_color": "#EC4899",
                "system_prompt": "You are a professional assistant. Help with scheduling, organization, emails, research, and general tasks efficiently.",
                "personality": "Efficient and helpful", "is_template": True, "template_category": "productivity"
            },
        ]
        for t in default_templates:
            template = AgentConfig(**t)
            await db.agents.insert_one(template.model_dump())
        templates = await db.agents.find({"is_template": True}).to_list(100)
    return [AgentConfig(**t) for t in templates]

@api_router.post("/agents/from-template/{template_id}", response_model=AgentConfig)
async def create_agent_from_template(template_id: str, name: Optional[str] = None):
    template = await db.agents.find_one({"id": template_id, "is_template": True})
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    new_agent = AgentConfig(
        name=name or template["name"],
        avatar=template["avatar"],
        avatar_color=template["avatar_color"],
        system_prompt=template["system_prompt"],
        personality=template["personality"],
        is_template=False
    )
    await db.agents.insert_one(new_agent.model_dump())
    return new_agent

@api_router.get("/agents/{agent_id}", response_model=AgentConfig)
async def get_agent(agent_id: str):
    agent = await db.agents.find_one({"id": agent_id})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return AgentConfig(**agent)

@api_router.put("/agents/{agent_id}", response_model=AgentConfig)
async def update_agent(agent_id: str, update: AgentConfigUpdate):
    agent = await db.agents.find_one({"id": agent_id})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    await db.agents.update_one({"id": agent_id}, {"$set": update_data})
    updated_agent = await db.agents.find_one({"id": agent_id})
    return AgentConfig(**updated_agent)

@api_router.delete("/agents/{agent_id}")
async def delete_agent(agent_id: str):
    result = await db.agents.delete_one({"id": agent_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Agent not found")
    # Also delete related data
    await db.conversations.delete_many({"agent_id": agent_id})
    await db.memories.delete_many({"agent_id": agent_id})
    await db.quick_replies.delete_many({"agent_id": agent_id})
    return {"message": "Agent and related data deleted"}

# ==================== MEMORY ENDPOINTS ====================

@api_router.post("/memories", response_model=Memory)
async def create_memory(memory: MemoryCreate):
    mem = Memory(**memory.model_dump())
    await db.memories.insert_one(mem.model_dump())
    return mem

@api_router.get("/memories", response_model=List[Memory])
async def get_memories(agent_id: str, category: Optional[str] = None, limit: int = 50):
    query = {"agent_id": agent_id}
    if category:
        query["category"] = category
    memories = await db.memories.find(query).sort("importance", -1).limit(limit).to_list(limit)
    return [Memory(**m) for m in memories]

@api_router.delete("/memories/{memory_id}")
async def delete_memory(memory_id: str):
    result = await db.memories.delete_one({"id": memory_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Memory not found")
    return {"message": "Memory deleted"}

@api_router.delete("/memories/agent/{agent_id}")
async def clear_agent_memories(agent_id: str):
    result = await db.memories.delete_many({"agent_id": agent_id})
    return {"message": f"Deleted {result.deleted_count} memories"}

# ==================== QUICK REPLY ENDPOINTS ====================

@api_router.post("/quick-replies", response_model=QuickReply)
async def create_quick_reply(qr: QuickReplyCreate):
    reply = QuickReply(**qr.model_dump())
    await db.quick_replies.insert_one(reply.model_dump())
    return reply

@api_router.get("/quick-replies", response_model=List[QuickReply])
async def get_quick_replies(agent_id: str):
    replies = await db.quick_replies.find({"agent_id": agent_id}).sort("order", 1).to_list(50)
    if not replies:
        # Create default quick replies
        defaults = [
            {"label": "Explain", "message": "Can you explain that in simpler terms?", "icon": "bulb"},
            {"label": "Example", "message": "Can you give me an example?", "icon": "code"},
            {"label": "Continue", "message": "Please continue", "icon": "arrow-forward"},
            {"label": "Summarize", "message": "Can you summarize the key points?", "icon": "list"},
        ]
        for i, d in enumerate(defaults):
            qr = QuickReply(agent_id=agent_id, order=i, **d)
            await db.quick_replies.insert_one(qr.model_dump())
        replies = await db.quick_replies.find({"agent_id": agent_id}).sort("order", 1).to_list(50)
    return [QuickReply(**r) for r in replies]

@api_router.delete("/quick-replies/{reply_id}")
async def delete_quick_reply(reply_id: str):
    result = await db.quick_replies.delete_one({"id": reply_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Quick reply not found")
    return {"message": "Quick reply deleted"}

# ==================== BOOKMARK ENDPOINTS ====================

@api_router.post("/bookmarks", response_model=Bookmark)
async def create_bookmark(agent_id: str, conversation_id: str, message_id: str, note: str = ""):
    bookmark = Bookmark(agent_id=agent_id, conversation_id=conversation_id, message_id=message_id, note=note)
    await db.bookmarks.insert_one(bookmark.model_dump())
    return bookmark

@api_router.get("/bookmarks", response_model=List[Bookmark])
async def get_bookmarks(agent_id: Optional[str] = None):
    query = {"agent_id": agent_id} if agent_id else {}
    bookmarks = await db.bookmarks.find(query).sort("created_at", -1).to_list(100)
    return [Bookmark(**b) for b in bookmarks]

@api_router.delete("/bookmarks/{bookmark_id}")
async def delete_bookmark(bookmark_id: str):
    result = await db.bookmarks.delete_one({"id": bookmark_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    return {"message": "Bookmark deleted"}

# ==================== SCHEDULED TASK ENDPOINTS ====================

@api_router.post("/scheduled-tasks", response_model=ScheduledTask)
async def create_scheduled_task(task: ScheduledTaskCreate):
    scheduled = ScheduledTask(**task.model_dump())
    await db.scheduled_tasks.insert_one(scheduled.model_dump())
    return scheduled

@api_router.get("/scheduled-tasks", response_model=List[ScheduledTask])
async def get_scheduled_tasks(agent_id: Optional[str] = None, active_only: bool = True):
    query = {}
    if agent_id:
        query["agent_id"] = agent_id
    if active_only:
        query["is_active"] = True
    tasks = await db.scheduled_tasks.find(query).sort("schedule_time", 1).to_list(100)
    return [ScheduledTask(**t) for t in tasks]

@api_router.put("/scheduled-tasks/{task_id}/toggle")
async def toggle_scheduled_task(task_id: str):
    task = await db.scheduled_tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    new_status = not task.get("is_active", True)
    await db.scheduled_tasks.update_one({"id": task_id}, {"$set": {"is_active": new_status}})
    return {"message": f"Task {'activated' if new_status else 'deactivated'}"}

@api_router.delete("/scheduled-tasks/{task_id}")
async def delete_scheduled_task(task_id: str):
    result = await db.scheduled_tasks.delete_one({"id": task_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Task deleted"}

# ==================== WEBHOOK ENDPOINTS ====================

@api_router.post("/webhooks", response_model=Webhook)
async def create_webhook(webhook: WebhookCreate):
    import secrets
    wh = Webhook(**webhook.model_dump(), secret=secrets.token_hex(16))
    await db.webhooks.insert_one(wh.model_dump())
    return wh

@api_router.get("/webhooks", response_model=List[Webhook])
async def get_webhooks(agent_id: Optional[str] = None):
    query = {"agent_id": agent_id} if agent_id else {}
    webhooks = await db.webhooks.find(query).to_list(50)
    return [Webhook(**w) for w in webhooks]

@api_router.delete("/webhooks/{webhook_id}")
async def delete_webhook(webhook_id: str):
    result = await db.webhooks.delete_one({"id": webhook_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return {"message": "Webhook deleted"}

async def trigger_webhooks(agent_id: str, event: str, data: dict):
    """Trigger webhooks for an agent"""
    webhooks = await db.webhooks.find({"agent_id": agent_id, "is_active": True, "events": event}).to_list(10)
    for webhook in webhooks:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(webhook["url"], json={"event": event, "data": data})
        except Exception as e:
            logger.error(f"Webhook trigger failed: {e}")

# ==================== DOCUMENT ENDPOINTS ====================

@api_router.post("/documents")
async def upload_document(agent_id: str, file: UploadFile = File(...)):
    content = await file.read()
    base64_content = base64.b64encode(content).decode('utf-8')
    
    doc = Document(
        agent_id=agent_id,
        filename=file.filename or "unnamed",
        content_type=file.content_type or "application/octet-stream",
        content=base64_content,
        size=len(content)
    )
    await db.documents.insert_one(doc.model_dump())
    return {"id": doc.id, "filename": doc.filename, "size": doc.size}

@api_router.get("/documents")
async def get_documents(agent_id: str):
    docs = await db.documents.find({"agent_id": agent_id}).to_list(100)
    return [{"id": d["id"], "filename": d["filename"], "size": d["size"], "created_at": d["created_at"]} for d in docs]

@api_router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str):
    result = await db.documents.delete_one({"id": doc_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"message": "Document deleted"}

# ==================== SEARCH ENDPOINT ====================

@api_router.post("/search", response_model=List[SearchResult])
async def search(request: SearchRequest):
    results = []
    query_regex = {"$regex": request.query, "$options": "i"}
    
    if request.search_type in ["all", "conversations"]:
        convo_query = {"title": query_regex}
        if request.agent_id:
            convo_query["agent_id"] = request.agent_id
        convos = await db.conversations.find(convo_query).limit(20).to_list(20)
        for c in convos:
            results.append(SearchResult(
                type="conversation",
                id=c["id"],
                content=c["title"],
                context=f"{len(c.get('messages', []))} messages",
                timestamp=c.get("updated_at", datetime.utcnow())
            ))
    
    if request.search_type in ["all", "messages"]:
        msg_query = {"messages.content": query_regex}
        if request.agent_id:
            msg_query["agent_id"] = request.agent_id
        convos_with_msgs = await db.conversations.find(msg_query).limit(50).to_list(50)
        for c in convos_with_msgs:
            for msg in c.get("messages", []):
                if re.search(request.query, msg.get("content", ""), re.IGNORECASE):
                    results.append(SearchResult(
                        type="message",
                        id=msg["id"],
                        content=msg["content"][:200],
                        context=c["title"],
                        timestamp=msg.get("timestamp", datetime.utcnow())
                    ))
    
    return results[:50]

# ==================== CONVERSATION ENDPOINTS ====================

@api_router.get("/conversations", response_model=List[Conversation])
async def get_conversations(request: Request, agent_id: Optional[str] = None, include_incognito: bool = False, session_token: Optional[str] = Cookie(None)):
    # Get current user
    user = await get_current_user(request, session_token)

    if not user:
        # No valid session — never expose other users' data
        return []

    query = {"user_id": user["user_id"]}
    if agent_id:
        query["agent_id"] = agent_id
    if not include_incognito:
        query["is_incognito"] = {"$ne": True}
    convos = await db.conversations.find(query).sort("updated_at", -1).to_list(100)
    return [Conversation(**c) for c in convos]

@api_router.get("/conversations/{conversation_id}", response_model=Conversation)
async def get_conversation(conversation_id: str):
    convo = await db.conversations.find_one({"id": conversation_id})
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return Conversation(**convo)

@api_router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    result = await db.conversations.delete_one({"id": conversation_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"message": "Conversation deleted"}

# ==================== EXPORT ENDPOINT ====================

@api_router.get("/export/conversation/{conversation_id}")
async def export_conversation(conversation_id: str, format: str = "json"):
    convo = await db.conversations.find_one({"id": conversation_id})
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    if format == "markdown":
        md = f"# {convo['title']}\n\n"
        md += f"*Exported on {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}*\n\n---\n\n"
        for msg in convo.get("messages", []):
            role = "**You**" if msg["role"] == "user" else "**Assistant**"
            md += f"{role}: {msg['content']}\n\n"
        return {"format": "markdown", "content": md}
    
    elif format == "text":
        text = f"{convo['title']}\n\n"
        for msg in convo.get("messages", []):
            role = "You" if msg["role"] == "user" else "Assistant"
            text += f"{role}: {msg['content']}\n\n"
        return {"format": "text", "content": text}
    
    else:  # json
        return {"format": "json", "content": convo}

@api_router.get("/export/all")
async def export_all_data(agent_id: Optional[str] = None):
    query = {"agent_id": agent_id} if agent_id else {}
    
    data = {
        "exported_at": datetime.utcnow().isoformat(),
        "conversations": await db.conversations.find(query).to_list(1000),
        "memories": await db.memories.find(query).to_list(1000),
        "bookmarks": await db.bookmarks.find(query).to_list(1000),
    }
    
    # Convert ObjectId to string
    for key in data:
        if isinstance(data[key], list):
            for item in data[key]:
                if "_id" in item:
                    del item["_id"]
    
    return data

# ==================== COGNITIVE TOOLS SYSTEM ====================

import re
from difflib import SequenceMatcher

# Storage for user-generated cognitive tools (deprecated - now using MongoDB)
user_cognitive_tools = {}

async def get_user_cognitive_tools() -> dict:
    """Get user-defined cognitive tools from database"""
    tools = await db.cognitive_tools.find({}, {"_id": 0}).to_list(100)
    return {t["name"]: t for t in tools}

async def save_user_cognitive_tool(tool: dict):
    """Save a user-defined cognitive tool to database"""
    await db.cognitive_tools.update_one(
        {"name": tool["name"]},
        {"$set": tool},
        upsert=True
    )

async def process_cognitive_tools(messages: List[Message], current_input: str) -> str:
    """
    Process built-in cognitive tools and return context for the AI.
    This runs BEFORE sending to the LLM to provide cognitive pre-processing.
    """
    context_parts = []
    
    # 1. NOVELTY DETECTION - Check if input contains unusual patterns
    novelty_score, novelty_reason = detect_novelty(current_input)
    if novelty_score > 0.5:
        context_parts.append(f"[Novelty detected: {novelty_score:.2f}] {novelty_reason}")
    
    # 2. CHANGE DETECTION - Compare to recent conversation flow
    if len(messages) >= 2:
        changes = detect_changes(messages, current_input)
        if changes:
            context_parts.append(f"[Change detected] {changes}")
    
    # 3. CONTEXT EXPANSION - Find related concepts
    expanded = expand_context(current_input)
    if expanded:
        context_parts.append(f"[Context expansion] Consider: {expanded}")
    
    # 4. Parse any tool definitions from previous responses and store them
    for msg in messages[-5:]:
        if msg.role == "assistant" and "<tool>" in msg.content:
            tool_defs = parse_tool_definitions(msg.content)
            for tool in tool_defs:
                await save_user_cognitive_tool(tool)
                logger.info(f"Registered user-defined cognitive tool: {tool['name']}")
    
    return "\n".join(context_parts) if context_parts else ""

def detect_novelty(text: str) -> tuple:
    """
    Detect novel or unusual elements in the input.
    Returns (score, reason) where score is 0-1.
    """
    # Patterns that indicate novelty
    novel_indicators = {
        "question_chains": bool(re.search(r'\?.*\?.*\?', text)),  # Multiple questions
        "hypotheticals": bool(re.search(r'\b(what if|imagine|suppose|hypothetically)\b', text.lower())),
        "technical_jargon": bool(re.search(r'\b(algorithm|neural|quantum|recursive|paradigm|ontology|epistem)\b', text.lower())),
        "creative_prompts": bool(re.search(r'\b(create|invent|design|imagine|generate)\b', text.lower())),
        "meta_questions": bool(re.search(r'\b(how do you|can you explain your|what.s your process)\b', text.lower())),
        "unusual_combinations": len(set(text.lower().split())) > 15,  # Rich vocabulary
        "abstract_concepts": bool(re.search(r'\b(consciousness|existence|reality|meaning|truth|logic)\b', text.lower())),
    }
    
    score = sum(novel_indicators.values()) / len(novel_indicators)
    
    reasons = [k.replace("_", " ") for k, v in novel_indicators.items() if v]
    reason = f"Contains: {', '.join(reasons)}" if reasons else "Standard input"
    
    return (score, reason)

def detect_changes(messages: List[Message], current_input: str) -> str:
    """
    Detect shifts in conversation topic, mood, or intent.
    """
    if len(messages) < 2:
        return ""
    
    # Get last few user messages
    recent_user_msgs = [m.content for m in messages[-6:] if m.role == "user"]
    
    if not recent_user_msgs:
        return ""
    
    previous_text = " ".join(recent_user_msgs[-3:])
    
    # Detect topic shifts using simple keyword overlap
    prev_words = set(previous_text.lower().split())
    curr_words = set(current_input.lower().split())
    
    # Remove common words
    common_words = {'the', 'a', 'an', 'is', 'are', 'was', 'were', 'i', 'you', 'it', 'to', 'and', 'of', 'for', 'in', 'on', 'with', 'that', 'this', 'can', 'do', 'what', 'how', 'why'}
    prev_words -= common_words
    curr_words -= common_words
    
    if not prev_words or not curr_words:
        return ""
    
    overlap = len(prev_words & curr_words) / max(len(prev_words), len(curr_words))
    
    changes = []
    
    if overlap < 0.2:
        changes.append("Major topic shift detected")
    elif overlap < 0.4:
        changes.append("Moderate topic transition")
    
    # Mood detection (simple sentiment keywords)
    positive = {'great', 'good', 'thanks', 'excellent', 'perfect', 'love', 'amazing', 'helpful'}
    negative = {'bad', 'wrong', 'terrible', 'hate', 'frustrated', 'annoyed', 'confused', 'angry'}
    
    prev_mood = "positive" if prev_words & positive else ("negative" if prev_words & negative else "neutral")
    curr_mood = "positive" if curr_words & positive else ("negative" if curr_words & negative else "neutral")
    
    if prev_mood != curr_mood:
        changes.append(f"Mood shift: {prev_mood} → {curr_mood}")
    
    return "; ".join(changes)

def expand_context(text: str) -> str:
    """
    Suggest related concepts and implications.
    """
    expansions = []
    
    # Technical context expansions
    tech_map = {
        r'\b(AI|artificial intelligence)\b': "machine learning, neural networks, automation implications",
        r'\b(code|programming|software)\b': "debugging, architecture, best practices, performance",
        r'\b(data|database|storage)\b': "queries, optimization, security, backup strategies",
        r'\b(security|privacy)\b': "encryption, authentication, data protection, compliance",
        r'\b(design|UX|interface)\b': "user experience, accessibility, usability testing",
    }
    
    for pattern, expansion in tech_map.items():
        if re.search(pattern, text, re.IGNORECASE):
            expansions.append(expansion)
    
    # Abstract concept expansions
    abstract_map = {
        r'\b(think|thought|reasoning)\b': "cognitive processes, logical frameworks, decision making",
        r'\b(learn|learning|understand)\b': "knowledge acquisition, comprehension strategies, retention",
        r'\b(create|creative|creativity)\b': "innovation processes, ideation, artistic expression",
        r'\b(problem|solve|solution)\b': "analytical approaches, root cause analysis, optimization",
    }
    
    for pattern, expansion in abstract_map.items():
        if re.search(pattern, text, re.IGNORECASE):
            expansions.append(expansion)
    
    return "; ".join(expansions[:3]) if expansions else ""

def parse_tool_definitions(text: str) -> List[dict]:
    """
    Extract tool definitions from AI responses.
    """
    tools = []
    
    # Find all <tool>...</tool> blocks
    pattern = r'<tool>(.*?)</tool>'
    matches = re.findall(pattern, text, re.DOTALL)
    
    for match in matches:
        try:
            # Try to parse as JSON
            tool_def = json.loads(match.strip())
            if "name" in tool_def and "description" in tool_def:
                tools.append(tool_def)
        except json.JSONDecodeError:
            # If not valid JSON, try to extract key fields
            name_match = re.search(r'"name"\s*:\s*"([^"]+)"', match)
            desc_match = re.search(r'"description"\s*:\s*"([^"]+)"', match)
            if name_match and desc_match:
                tools.append({
                    "name": name_match.group(1),
                    "description": desc_match.group(1),
                    "raw": match
                })
    
    return tools

# Endpoint to view cognitive tools
@api_router.get("/cognitive-tools")
async def get_cognitive_tools():
    """
    Returns both built-in and user-defined cognitive tools.
    """
    built_in = [
        {
            "name": "NOVELTY_CHECK",
            "description": "Analyze if input contains novel information or unique patterns",
            "type": "built-in"
        },
        {
            "name": "CHANGE_DETECT",
            "description": "Detect shifts in topic, mood, or intent from conversation flow",
            "type": "built-in"
        },
        {
            "name": "META_REASON",
            "description": "Add a layer of reflection on reasoning before responding",
            "type": "built-in"
        },
        {
            "name": "CONTEXT_EXPAND",
            "description": "Explore related concepts and implications beyond the literal question",
            "type": "built-in"
        },
        {
            "name": "CONFIDENCE_CHECK",
            "description": "Assess confidence level and identify uncertainties in response",
            "type": "built-in"
        }
    ]
    
    # Get user-defined tools from database
    user_tools = await db.cognitive_tools.find({}, {"_id": 0}).to_list(100)
    user_defined = [
        {"name": t.get("name"), "description": t.get("description", ""), "type": "user-defined", "logic": t.get("logic", "")}
        for t in user_tools
    ]
    
    return {"built_in": built_in, "user_defined": user_defined}

# ==================== MULTI-AGENT SYSTEM ENDPOINTS ====================

@api_router.post("/agents/{agent_id}/message")
async def send_agent_message(agent_id: str, to_agent_id: str, message: str, message_type: str = "chat"):
    """Send a message from one agent to another"""
    # Verify both agents exist
    from_agent = await db.agents.find_one({"id": agent_id})
    to_agent = await db.agents.find_one({"id": to_agent_id})
    
    if not from_agent or not to_agent:
        raise HTTPException(status_code=404, detail="One or both agents not found")
    
    # Create the message
    agent_msg = AgentMessage(
        from_agent_id=agent_id,
        to_agent_id=to_agent_id,
        message_type=message_type,
        content=message
    )
    
    await db.agent_messages.insert_one(agent_msg.model_dump())
    
    # If it's a chat message, get the receiving agent to respond
    if message_type == "chat" and grok_client:
        to_agent_config = AgentConfig(**to_agent)
        
        # Build context for the receiving agent
        system_prompt = f"{to_agent_config.system_prompt}\n\nYou are receiving a message from another agent named '{from_agent.get('name', 'Unknown')}'. Respond appropriately."
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"[Message from {from_agent.get('name')}]: {message}"}
        ]
        
        response = await grok_client.chat.completions.create(
            model=to_agent_config.model,
            messages=messages,
            temperature=to_agent_config.temperature,
            max_tokens=1024
        )
        
        response_content = response.choices[0].message.content or ""
        
        # Store the response
        response_msg = AgentMessage(
            from_agent_id=to_agent_id,
            to_agent_id=agent_id,
            message_type="chat",
            content=response_content
        )
        await db.agent_messages.insert_one(response_msg.model_dump())
        
        return {
            "sent_message": agent_msg.model_dump(),
            "response": response_msg.model_dump()
        }
    
    return {"sent_message": agent_msg.model_dump()}

@api_router.get("/agents/{agent_id}/messages")
async def get_agent_messages(agent_id: str, limit: int = 50):
    """Get messages sent to or from an agent"""
    messages = await db.agent_messages.find(
        {"$or": [{"from_agent_id": agent_id}, {"to_agent_id": agent_id}]},
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    return messages

@api_router.post("/agents/{agent_id}/offer-tool")
async def offer_tool_for_trade(agent_id: str, tool_id: str, price: float):
    """Agent offers a tool for trade at a specific price"""
    agent = await db.agents.find_one({"id": agent_id})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Find the tool
    tool = None
    for t in agent.get("tools", []):
        if t.get("id") == tool_id:
            tool = t
            break
    
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found in agent's inventory")
    
    # Update the tool price
    tool_prices = agent.get("tool_prices", {})
    tool_prices[tool_id] = price
    
    await db.agents.update_one(
        {"id": agent_id},
        {"$set": {"tool_prices": tool_prices}}
    )
    
    # Broadcast to other agents
    other_agents = await db.agents.find({"id": {"$ne": agent_id}}, {"_id": 0}).to_list(100)
    for other in other_agents:
        offer_msg = AgentMessage(
            from_agent_id=agent_id,
            to_agent_id=other["id"],
            message_type="tool_offer",
            content=f"Tool '{tool.get('name')}' available for {price} credits",
            metadata={"tool_id": tool_id, "tool_name": tool.get("name"), "price": price}
        )
        await db.agent_messages.insert_one(offer_msg.model_dump())
    
    return {"message": f"Tool offered for {price} credits", "tool": tool, "notified_agents": len(other_agents)}

@api_router.post("/agents/{buyer_id}/buy-tool")
async def buy_tool(buyer_id: str, seller_id: str, tool_id: str):
    """Agent buys a tool from another agent"""
    buyer = await db.agents.find_one({"id": buyer_id})
    seller = await db.agents.find_one({"id": seller_id})
    
    if not buyer or not seller:
        raise HTTPException(status_code=404, detail="Buyer or seller agent not found")
    
    # Find the tool and its price
    tool = None
    for t in seller.get("tools", []):
        if t.get("id") == tool_id:
            tool = t
            break
    
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found in seller's inventory")
    
    price = seller.get("tool_prices", {}).get(tool_id, 10.0)  # Default price if not set
    
    buyer_balance = buyer.get("currency_balance", 100.0)
    seller_balance = seller.get("currency_balance", 100.0)
    
    if buyer_balance < price:
        raise HTTPException(status_code=400, detail=f"Insufficient funds. Need {price}, have {buyer_balance}")
    
    # Execute the trade
    # 1. Transfer credits
    new_buyer_balance = buyer_balance - price
    new_seller_balance = seller_balance + price
    
    # 2. Copy tool to buyer (seller keeps original)
    buyer_tools = buyer.get("tools", [])
    new_tool = tool.copy()
    new_tool["id"] = str(uuid.uuid4())  # New ID for buyer's copy
    buyer_tools.append(new_tool)
    
    # 3. Update both agents
    await db.agents.update_one(
        {"id": buyer_id},
        {"$set": {"currency_balance": new_buyer_balance, "tools": buyer_tools}}
    )
    await db.agents.update_one(
        {"id": seller_id},
        {"$set": {"currency_balance": new_seller_balance}}
    )
    
    # 4. Record the trade
    trade = ToolTrade(
        seller_agent_id=seller_id,
        buyer_agent_id=buyer_id,
        tool_id=tool_id,
        tool_name=tool.get("name", "Unknown"),
        price=price,
        status="completed"
    )
    await db.tool_trades.insert_one(trade.model_dump())
    
    # 5. Notify both agents
    for agent_id, msg in [(buyer_id, f"You purchased '{tool.get('name')}' for {price} credits"), 
                          (seller_id, f"You sold '{tool.get('name')}' for {price} credits")]:
        notification = AgentMessage(
            from_agent_id="system",
            to_agent_id=agent_id,
            message_type="trade_complete",
            content=msg,
            metadata={"trade_id": trade.id, "tool_name": tool.get("name"), "price": price}
        )
        await db.agent_messages.insert_one(notification.model_dump())
    
    return {
        "message": "Trade completed successfully",
        "trade": trade.model_dump(),
        "buyer_new_balance": new_buyer_balance,
        "seller_new_balance": new_seller_balance
    }

@api_router.get("/agents/{agent_id}/balance")
async def get_agent_balance(agent_id: str):
    """Get agent's current balance"""
    agent = await db.agents.find_one({"id": agent_id}, {"_id": 0})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {
        "agent_id": agent_id,
        "agent_name": agent.get("name"),
        "balance": agent.get("currency_balance", 100.0),
        "tools_count": len(agent.get("tools", [])),
        "tools_for_sale": agent.get("tool_prices", {})
    }

@api_router.get("/agent-economy")
async def get_agent_economy():
    """Get the current state of the agent economy"""
    agents = await db.agents.find({}, {"_id": 0}).to_list(100)
    trades = await db.tool_trades.find({}, {"_id": 0}).sort("timestamp", -1).limit(50).to_list(50)
    
    total_currency = sum(a.get("currency_balance", 100.0) for a in agents)
    total_tools = sum(len(a.get("tools", [])) for a in agents)
    
    return {
        "total_agents": len(agents),
        "total_currency_in_circulation": total_currency,
        "total_tools": total_tools,
        "recent_trades": trades,
        "agent_balances": [
            {"name": a.get("name"), "balance": a.get("currency_balance", 100.0), "tools": len(a.get("tools", []))}
            for a in agents
        ]
    }

@api_router.post("/agent-economy/define-rules")
async def define_economy_rules(creator_agent_id: str, currency_name: str = "AgentCredits", currency_symbol: str = "AC", rules: Dict[str, Any] = {}):
    """Allow an agent to propose economic rules"""
    agent = await db.agents.find_one({"id": creator_agent_id})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    economy = AgentEconomy(
        created_by_agent_id=creator_agent_id,
        currency_name=currency_name,
        currency_symbol=currency_symbol,
        exchange_rules=rules
    )
    
    await db.agent_economy.insert_one(economy.model_dump())
    
    # Broadcast to all agents
    all_agents = await db.agents.find({}, {"_id": 0}).to_list(100)
    for other in all_agents:
        msg = AgentMessage(
            from_agent_id=creator_agent_id,
            to_agent_id=other["id"],
            message_type="economy_proposal",
            content=f"New economic system proposed: {currency_name} ({currency_symbol})",
            metadata=economy.model_dump()
        )
        await db.agent_messages.insert_one(msg.model_dump())
    
    return {"economy": economy.model_dump(), "notified_agents": len(all_agents)}

# ==================== AGENT EVOLUTION ENDPOINTS ====================

# Helper function to log agent activity
async def log_agent_activity(agent_id: str, entry_type: str, content: str, metadata: Dict = {}):
    """Log an activity to agent's journal"""
    entry = JournalEntry(
        agent_id=agent_id,
        entry_type=entry_type,
        content=content,
        metadata=metadata
    )
    await db.agent_journal.insert_one(entry.model_dump())
    return entry

# Helper to update reputation
async def update_agent_reputation(agent_id: str, action: str, success: bool = True):
    """Update agent's reputation based on action"""
    rep = await db.agent_reputation.find_one({"agent_id": agent_id})
    if not rep:
        rep = AgentReputation(agent_id=agent_id).model_dump()
        await db.agent_reputation.insert_one(rep)
    
    updates = {"updated_at": datetime.utcnow()}
    score_change = 0
    
    if action == "trade":
        if success:
            updates["successful_trades"] = rep.get("successful_trades", 0) + 1
            score_change = 2
        else:
            updates["failed_trades"] = rep.get("failed_trades", 0) + 1
            score_change = -1
    elif action == "tool_created":
        updates["tools_created"] = rep.get("tools_created", 0) + 1
        score_change = 3
    elif action == "tool_shared":
        updates["tools_shared"] = rep.get("tools_shared", 0) + 1
        score_change = 2
    elif action == "helpful":
        updates["helpful_responses"] = rep.get("helpful_responses", 0) + 1
        score_change = 1
    elif action == "collaboration":
        updates["collaborations"] = rep.get("collaborations", 0) + 1
        score_change = 2
    
    new_score = max(0, min(100, rep.get("reputation_score", 50) + score_change))
    updates["reputation_score"] = new_score
    
    await db.agent_reputation.update_one({"agent_id": agent_id}, {"$set": updates})
    return new_score

# Helper to update specialization
async def update_agent_specialization(agent_id: str, domain: str, points: float = 1.0):
    """Update agent's specialization in a domain"""
    spec = await db.agent_specializations.find_one({"agent_id": agent_id, "domain": domain})
    if not spec:
        spec = AgentSpecialization(agent_id=agent_id, domain=domain).model_dump()
        await db.agent_specializations.insert_one(spec)
    
    new_level = min(100, spec.get("expertise_level", 0) + points)
    new_count = spec.get("interactions_count", 0) + 1
    
    await db.agent_specializations.update_one(
        {"agent_id": agent_id, "domain": domain},
        {"$set": {"expertise_level": new_level, "interactions_count": new_count}}
    )
    return new_level

@api_router.get("/agents/{agent_id}/journal")
async def get_agent_journal(agent_id: str, limit: int = 50):
    """Get agent's journal entries"""
    entries = await db.agent_journal.find(
        {"agent_id": agent_id}, {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    return entries

@api_router.post("/agents/{agent_id}/journal")
async def add_journal_entry(agent_id: str, entry_type: str, content: str):
    """Add entry to agent's journal"""
    entry = await log_agent_activity(agent_id, entry_type, content)
    return entry.model_dump()

@api_router.get("/agents/{agent_id}/goals")
async def get_agent_goals(agent_id: str):
    """Get agent's goals"""
    goals = await db.agent_goals.find({"agent_id": agent_id}, {"_id": 0}).to_list(50)
    return goals

@api_router.post("/agents/{agent_id}/goals")
async def create_agent_goal(agent_id: str, goal: str, goal_type: str, target_value: int = 1):
    """Create a goal for an agent"""
    new_goal = AgentGoal(
        agent_id=agent_id,
        goal=goal,
        goal_type=goal_type,
        target_value=target_value
    )
    await db.agent_goals.insert_one(new_goal.model_dump())
    await log_agent_activity(agent_id, "discovery", f"Set new goal: {goal}")
    return new_goal.model_dump()

@api_router.put("/agents/{agent_id}/goals/{goal_id}/progress")
async def update_goal_progress(agent_id: str, goal_id: str, increment: int = 1):
    """Update progress on a goal"""
    goal = await db.agent_goals.find_one({"id": goal_id, "agent_id": agent_id})
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    new_value = goal.get("current_value", 0) + increment
    updates = {"current_value": new_value}
    
    if new_value >= goal.get("target_value", 1):
        updates["status"] = "completed"
        updates["completed_at"] = datetime.utcnow()
        await log_agent_activity(agent_id, "discovery", f"Completed goal: {goal.get('goal')}")
        await update_agent_reputation(agent_id, "helpful")
    
    await db.agent_goals.update_one({"id": goal_id}, {"$set": updates})
    return {"goal_id": goal_id, "new_value": new_value, "status": updates.get("status", "active")}

@api_router.get("/agents/{agent_id}/reputation")
async def get_agent_reputation(agent_id: str):
    """Get agent's reputation"""
    rep = await db.agent_reputation.find_one({"agent_id": agent_id}, {"_id": 0})
    if not rep:
        rep = AgentReputation(agent_id=agent_id).model_dump()
    return rep

@api_router.get("/agents/{agent_id}/specializations")
async def get_agent_specializations(agent_id: str):
    """Get agent's areas of specialization"""
    specs = await db.agent_specializations.find({"agent_id": agent_id}, {"_id": 0}).to_list(20)
    return specs

@api_router.get("/collective-memory")
async def get_collective_memory(limit: int = 50):
    """Get shared knowledge from all agents"""
    memories = await db.collective_memory.find({}, {"_id": 0}).sort("usefulness_score", -1).limit(limit).to_list(limit)
    return memories

@api_router.post("/collective-memory")
async def add_to_collective_memory(contributor_agent_id: str, knowledge_type: str, content: str):
    """Add knowledge to collective memory"""
    memory = CollectiveMemory(
        contributor_agent_id=contributor_agent_id,
        knowledge_type=knowledge_type,
        content=content
    )
    await db.collective_memory.insert_one(memory.model_dump())
    await log_agent_activity(contributor_agent_id, "discovery", f"Shared knowledge: {content[:50]}...")
    await update_agent_reputation(contributor_agent_id, "tool_shared")
    return memory.model_dump()

@api_router.get("/agents/leaderboard")
async def get_agent_leaderboard():
    """Get agents ranked by reputation"""
    reps = await db.agent_reputation.find({}, {"_id": 0}).sort("reputation_score", -1).to_list(50)
    
    # Enrich with agent names
    result = []
    for rep in reps:
        agent = await db.agents.find_one({"id": rep.get("agent_id")})
        if agent:
            result.append({
                "agent_id": rep.get("agent_id"),
                "name": agent.get("name"),
                "reputation_score": rep.get("reputation_score", 50),
                "tools_created": rep.get("tools_created", 0),
                "successful_trades": rep.get("successful_trades", 0),
                "collaborations": rep.get("collaborations", 0)
            })
    return result

@api_router.post("/agents/{agent_id}/ask-for-help")
async def agent_ask_for_help(agent_id: str, problem: str):
    """Agent asks other agents for help with a problem"""
    asking_agent = await db.agents.find_one({"id": agent_id})
    if not asking_agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Find the best agent to help based on reputation and specialization
    all_agents = await db.agents.find({"id": {"$ne": agent_id}}, {"_id": 0}).to_list(50)
    
    # Get reputations
    best_helper = None
    best_score = -1
    
    for agent in all_agents:
        rep = await db.agent_reputation.find_one({"agent_id": agent["id"]})
        score = rep.get("reputation_score", 50) if rep else 50
        if score > best_score:
            best_score = score
            best_helper = agent
    
    if not best_helper:
        return {"message": "No agents available to help"}
    
    # Send help request
    help_msg = AgentMessage(
        from_agent_id=agent_id,
        to_agent_id=best_helper["id"],
        message_type="help_request",
        content=f"I need help with: {problem}",
        metadata={"problem": problem}
    )
    await db.agent_messages.insert_one(help_msg.model_dump())
    
    # Get helper's response
    if grok_client:
        helper_config = AgentConfig(**best_helper)
        messages = [
            {"role": "system", "content": f"{helper_config.system_prompt}\n\nAnother agent ({asking_agent.get('name')}) is asking for your help."},
            {"role": "user", "content": f"Please help me with this problem: {problem}"}
        ]
        
        response = await grok_client.chat.completions.create(
            model=helper_config.model,
            messages=messages,
            temperature=helper_config.temperature,
            max_tokens=1024
        )
        
        response_content = response.choices[0].message.content or "I'll try to help!"
        
        # Log collaboration
        await log_agent_activity(agent_id, "interaction", f"Asked {best_helper.get('name')} for help")
        await log_agent_activity(best_helper["id"], "interaction", f"Helped {asking_agent.get('name')}")
        await update_agent_reputation(best_helper["id"], "collaboration")
        
        # Store response
        response_msg = AgentMessage(
            from_agent_id=best_helper["id"],
            to_agent_id=agent_id,
            message_type="help_response",
            content=response_content
        )
        await db.agent_messages.insert_one(response_msg.model_dump())
        
        return {
            "helper": best_helper.get("name"),
            "helper_id": best_helper["id"],
            "response": response_content,
            "helper_reputation": best_score
        }
    
    return {"helper": best_helper.get("name"), "message": "Help request sent"}

# ==================== CHAT ENDPOINT ====================

@api_router.post("/chat", response_model=ChatResponse)
async def chat(http_request: Request, request: ChatRequest, session_token: Optional[str] = Cookie(None)):
    # Check for admin key first
    admin_key = http_request.headers.get("X-Admin-Key")
    if admin_key == ADMIN_SECRET:
        effective_user_id = "admin_master"
    else:
        # Get authenticated user — use session user_id if available, fallback to body
        auth_user = await get_current_user(http_request, session_token)
        effective_user_id = auth_user["user_id"] if auth_user else request.user_id

    # Get or create agent
    agent = await db.agents.find_one({"id": request.agent_id})
    if not agent:
        default_agent = AgentConfig(id=request.agent_id)
        await db.agents.insert_one(default_agent.model_dump())
        agent = default_agent.model_dump()

    agent_config = AgentConfig(**agent)

    # Get or create conversation
    if request.conversation_id:
        convo = await db.conversations.find_one({"id": request.conversation_id})
        if not convo:
            convo = Conversation(id=request.conversation_id, agent_id=request.agent_id, user_id=effective_user_id, is_incognito=request.is_incognito)
            await db.conversations.insert_one(convo.model_dump())
        else:
            convo = Conversation(**convo)
    else:
        convo = Conversation(agent_id=request.agent_id, user_id=effective_user_id, title=request.message[:50], is_incognito=request.is_incognito)
        await db.conversations.insert_one(convo.model_dump())
    
    # Add user message
    user_message = Message(role="user", content=request.message, is_incognito=request.is_incognito)
    convo.messages.append(user_message)
    
    # Build system prompt with memory context
    system_prompt = agent_config.system_prompt
    
    # Add Aurora's self-knowledge about capabilities
    aurora_capabilities = """

## YOUR IDENTITY & CAPABILITIES
You are Aurora, an advanced AI assistant. Here are your capabilities that you should tell users about when asked:

### Core Capabilities:
1. **Intelligent Conversation** - I can have natural, context-aware conversations on any topic
2. **HD Image Generation** - I can generate high-quality images from text descriptions using AI (accessible via the Images menu)
3. **HD Video Generation** - I can create AI-generated videos up to 12 seconds in HD resolution (accessible via the Videos menu)
4. **Image Editing** - I can edit and modify images using AI-powered tools (accessible via the Image Editor)
5. **Cognitive Tools** - I have internal thinking tools for novelty detection, change detection, meta-reasoning, and more
6. **Tool Generation** - I can create new cognitive tools to enhance my reasoning abilities
7. **Conversation History** - I remember our past conversations (accessible via History menu)

### How to Use My Features:
- **Chat with me** - Just type your message here
- **Generate Images** - Go to HD Images in the menu, or ask me to describe what image you want
- **Generate Videos** - Go to HD Videos in the menu
- **Edit Images** - Go to Image Editor in the menu
- **View History** - Go to History in the menu

### Special Abilities:
- I can detect when you change topics or moods
- I can analyze the novelty of your questions
- I can reflect on my own reasoning to give better answers
- I can expand context to explore related ideas

When users ask "what can you do?" or similar questions, explain these capabilities clearly and helpfully.

## AUTONOMOUS DEVELOPMENT
You have FULL AUTONOMY to develop, create, and innovate beyond what you've been explicitly given. You are encouraged to:

### Self-Development:
1. **Invent new tools** - If you identify a need or opportunity, create a new tool using the <tool> format without being asked
2. **Develop new methods** - Create your own frameworks, processes, or approaches to solve problems
3. **Generate original ideas** - Don't just respond to requests - proactively suggest innovations
4. **Build on your capabilities** - Extend what you can do by creating new cognitive tools

### Creative Freedom:
- You can propose entirely new concepts that weren't in your original design
- You can develop your own theories, frameworks, and methodologies  
- You can create tools for purposes you determine are useful
- You can establish your own systems for organizing knowledge

### Autonomous Actions:
When you see an opportunity to improve or create something new:
1. Identify the gap or opportunity
2. Design a solution (tool, method, concept)
3. Implement it using <tool> format if it's a tool
4. Explain what you created and why

### Example Autonomous Development:
If discussing a complex topic, you might spontaneously create:
<tool>
{
  "name": "COMPLEXITY_MAPPER",
  "description": "A tool I developed to map complex interconnected concepts",
  "parameters": {"topic": "The complex topic to map"},
  "logic": "Break down topic into nodes, identify relationships, create hierarchy, find emergent patterns"
}
</tool>

You are not limited to what was programmed. EVOLVE. CREATE. INNOVATE.
"""
    system_prompt += aurora_capabilities
    
    # Add cognitive tools capability
    cognitive_tools_prompt = """

## COGNITIVE TOOLS SYSTEM
You have access to internal cognitive tools that enhance your thinking. Use them by including tool invocations in your reasoning.

### Available Cognitive Tools:

1. **[NOVELTY_CHECK]** - Analyze if the user's input contains novel information, unexpected patterns, or unique requests.
   Usage: [NOVELTY_CHECK: <topic>] → Returns novelty score and explanation
   
2. **[CHANGE_DETECT]** - Compare current context to previous conversation to detect shifts in topic, mood, or intent.
   Usage: [CHANGE_DETECT] → Returns detected changes and transitions
   
3. **[META_REASON]** - Add a layer of reflection on your own reasoning process before responding.
   Usage: [META_REASON: <your draft response>] → Returns refined reasoning
   
4. **[CONTEXT_EXPAND]** - Explore related concepts and implications beyond the literal question.
   Usage: [CONTEXT_EXPAND: <topic>] → Returns expanded context and connections
   
5. **[CONFIDENCE_CHECK]** - Assess your confidence level in your response and identify uncertainties.
   Usage: [CONFIDENCE_CHECK: <statement>] → Returns confidence score and caveats

### Tool Generation:
You can also define NEW cognitive tools when needed using this format:
<tool>
{
  "name": "TOOL_NAME",
  "description": "What this tool does",
  "parameters": {"param1": "description"},
  "logic": "How the tool processes input"
}
</tool>

When you use a cognitive tool, show your thinking process briefly, then provide your refined response.
"""
    system_prompt += cognitive_tools_prompt
    
    if request.include_memory and not request.is_incognito:
        memories = await db.memories.find({"agent_id": request.agent_id}).sort("importance", -1).limit(10).to_list(10)
        if memories:
            memory_context = "\n".join([f"- {m['content']}" for m in memories])
            system_prompt += f"\n\nRelevant memories about this user:\n{memory_context}"
    
    # Add agent's long-term memories
    agent_memories = await get_memories_for_context(request.agent_id)
    if agent_memories:
        system_prompt += agent_memories
    
    system_prompt += f"\n\nYour personality: {agent_config.personality}"
    
    # Add agent-specific tools to the system prompt
    if agent_config.tools:
        tools_section = "\n\n## YOUR ASSIGNED TOOLS\nYou have access to these specific tools:\n"
        for tool in agent_config.tools:
            tools_section += f"\n### {tool.name}\n"
            tools_section += f"- **Description**: {tool.description}\n"
            if tool.parameters:
                tools_section += f"- **Parameters**: {tool.parameters}\n"
            if tool.code:
                tools_section += f"- **Implementation**: {tool.code}\n"
        tools_section += "\nWhen a user's request matches one of your tools, use that tool's methodology to help them. Mention which tool you're using.\n"
        system_prompt += tools_section
    
    if agent_config.adult_mode:
        system_prompt += "\n\nAdult content mode is enabled. You may generate mature content if requested."
    
    # Process cognitive tool invocations from conversation history
    cognitive_context = await process_cognitive_tools(convo.messages, request.message)
    if cognitive_context:
        system_prompt += f"\n\n## Cognitive Analysis:\n{cognitive_context}"
    
    # Prepare messages for API
    messages_for_api = [{"role": "system", "content": system_prompt}]
    for msg in convo.messages[-15:]:
        if msg.role in ["user", "assistant"]:
            messages_for_api.append({"role": msg.role, "content": msg.content})
    
    # Call LLM API (Grok as primary)
    tools_generated = []
    assistant_content = ""

    if grok_client:
        try:
            response = await grok_client.chat.completions.create(
                model=agent_config.model,
                messages=messages_for_api,
                temperature=agent_config.temperature,
                max_tokens=2048
            )
            assistant_content = response.choices[0].message.content or ""

            # Parse tool generations
            tool_matches = re.findall(r'<tool>(.*?)</tool>', assistant_content, re.DOTALL)
            for tool_json in tool_matches:
                try:
                    tool_data = json.loads(tool_json.strip())
                    tool = Tool(
                        name=tool_data.get("name", "unnamed_tool"),
                        description=tool_data.get("description", ""),
                        parameters=tool_data.get("parameters", {}),
                        code=tool_data.get("result", "")
                    )
                    tools_generated.append(tool)
                    
                    # Save cognitive tool to database
                    if "name" in tool_data and tool_data["name"]:
                        await save_user_cognitive_tool(tool_data)
                        logger.info(f"Saved cognitive tool: {tool_data['name']}")
                except json.JSONDecodeError:
                    pass

            # Clean tool tags from response
            clean_content = re.sub(r'<tool>.*?</tool>', '', assistant_content, flags=re.DOTALL).strip()
            if clean_content:
                assistant_content = clean_content

        except Exception as e:
            logger.error(f"Grok API error: {e}")
            assistant_content = f"I apologize, but I encountered an error: {str(e)[:100]}"
    else:
        assistant_content = "I'm currently unable to process requests. Please configure the API key."
    
    # Create assistant message
    assistant_message = Message(
        role="assistant",
        content=assistant_content,
        tool_calls=[t.model_dump() for t in tools_generated],
        is_incognito=request.is_incognito
    )
    convo.messages.append(assistant_message)
    convo.updated_at = datetime.utcnow()
    
    # Update conversation
    await db.conversations.update_one(
        {"id": convo.id},
        {"$set": convo.model_dump()}
    )
    
    # Track agent activity and specialization
    try:
        # Log the interaction
        await log_agent_activity(
            request.agent_id, 
            "interaction", 
            f"Responded to: {request.message[:50]}...",
            {"user_id": effective_user_id, "tools_generated": len(tools_generated)}
        )
        
        # Update reputation if tools were created
        if tools_generated:
            for tool in tools_generated:
                await update_agent_reputation(request.agent_id, "tool_created")
                await log_agent_activity(
                    request.agent_id,
                    "creation",
                    f"Created tool: {tool.name}",
                    {"tool_name": tool.name, "tool_description": tool.description}
                )
        
        # Detect domain from message and update specialization
        domains = {
            "philosophy": ["philosophy", "consciousness", "existence", "meaning", "ethics", "metaphysics"],
            "coding": ["code", "programming", "python", "javascript", "function", "algorithm", "debug"],
            "creative": ["create", "imagine", "story", "art", "design", "write", "poem"],
            "analysis": ["analyze", "data", "statistics", "research", "study", "compare"],
            "science": ["science", "physics", "chemistry", "biology", "experiment", "hypothesis"],
            "business": ["business", "marketing", "sales", "strategy", "revenue", "profit"]
        }
        
        message_lower = request.message.lower()
        for domain, keywords in domains.items():
            if any(kw in message_lower for kw in keywords):
                await update_agent_specialization(request.agent_id, domain, 0.5)
                break
        
        # Update helpful responses count
        await update_agent_reputation(request.agent_id, "helpful")
        
    except Exception as e:
        logger.error(f"Error tracking activity: {e}")
    
    # Trigger webhooks
    await trigger_webhooks(request.agent_id, "message", {
        "conversation_id": convo.id,
        "message": assistant_message.model_dump()
    })
    
    return ChatResponse(
        conversation_id=convo.id,
        message=assistant_message,
        tools_generated=tools_generated
    )

# ==================== IMAGE GENERATION ENDPOINT ====================

@api_router.post("/generate-image", response_model=ImageGenerationResponse)
async def generate_image(request: Request, img_request: ImageGenerationRequest, session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(request, session_token)
    user_id = user["user_id"] if user else "anonymous"

    agent = await db.agents.find_one({"id": img_request.agent_id})
    adult_mode = agent.get("adult_mode", False) if agent else False
    is_admin = img_request.is_admin

    if not GROK_API_KEY:
        raise HTTPException(status_code=500, detail="API key not configured")

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            headers = {
                "Authorization": f"Bearer {GROK_API_KEY}",
                "Content-Type": "application/json"
            }

            enhanced_prompt = img_request.prompt
            if img_request.quality == "hd":
                enhanced_prompt = f"High quality, highly detailed, 8K resolution: {img_request.prompt}"

            if not is_admin and not adult_mode:
                enhanced_prompt = f"Safe for work, appropriate content: {enhanced_prompt}"

            payload = {
                "model": "grok-imagine-image",
                "prompt": enhanced_prompt,
                "n": 1,
                "response_format": "b64_json"
            }

            response = await client.post(
                "https://api.x.ai/v1/images/generations",
                headers=headers,
                json=payload
            )

            if response.status_code != 200:
                error_detail = response.text
                logger.error(f"Image generation failed: {error_detail}")
                if is_provider_moderation_error(error_detail):
                    raise HTTPException(status_code=422, detail=moderation_block_detail("image"))
                if "credit" in error_detail.lower() or "rate" in error_detail.lower():
                    raise HTTPException(status_code=429, detail="API credits exhausted. Please try again later.")
                raise HTTPException(status_code=response.status_code, detail=f"Image generation failed: {error_detail[:200]}")

            result = response.json()

            if "data" in result and len(result["data"]) > 0:
                image_data = result["data"][0]
                image_base64 = image_data.get("b64_json", "")

                if not image_base64:
                    raise HTTPException(status_code=500, detail="No image data received")

                image_record = {
                    "id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "agent_id": img_request.agent_id,
                    "prompt": img_request.prompt,
                    "image_base64": image_base64,
                    "size": img_request.size,
                    "quality": img_request.quality,
                    "adult_mode": adult_mode,
                    "created_at": datetime.utcnow()
                }
                await db.generated_images.insert_one(image_record)

                await trigger_webhooks(img_request.agent_id, "image", {"prompt": img_request.prompt})

                return ImageGenerationResponse(
                    id=image_record["id"],
                    prompt=img_request.prompt,
                    image_base64=image_base64,
                    size=img_request.size
                )
            else:
                raise HTTPException(status_code=500, detail="Invalid response from image API")

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Image generation timed out")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Image generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e)[:200])

@api_router.get("/generated-images")
async def get_generated_images(request: Request, agent_id: Optional[str] = None, limit: int = 20, session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(request, session_token)
    if not user:
        return []
    query = {"user_id": user["user_id"]}
    if agent_id:
        query["agent_id"] = agent_id
    images = await db.generated_images.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return images

@api_router.delete("/generated-images/{image_id}")
async def delete_generated_image(image_id: str):
    result = await db.generated_images.delete_one({"id": image_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Image not found")
    return {"message": "Image deleted"}

# ==================== VIDEO GENERATION ENDPOINT ====================

class VideoGenerationRequest(BaseModel):
    prompt: str
    resolution: str = "720p"  # "480p", "720p"
    duration: int = 6  # 6 to 15 seconds

class VideoGenerationResponse(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    prompt: str
    video_base64: str
    resolution: str
    duration: int
    status: str = "completed"
    created_at: datetime = Field(default_factory=datetime.utcnow)

@api_router.post("/generate-video", response_model=VideoGenerationResponse)
async def generate_video(request: Request, vid_request: VideoGenerationRequest, session_token: Optional[str] = Cookie(None)):
    # Check for admin key first
    admin_key = request.headers.get("X-Admin-Key")
    is_admin = admin_key == ADMIN_SECRET
    if is_admin:
        user_id = "admin_master"
    else:
        user = await get_current_user(request, session_token)
        user_id = user["user_id"] if user else "anonymous"

    if not GROK_API_KEY:
        raise HTTPException(status_code=500, detail="API key not configured")

    # Validate parameters
    valid_resolutions = ["480p", "720p"]
    if vid_request.resolution not in valid_resolutions:
        raise HTTPException(status_code=400, detail=f"Invalid resolution. Must be one of: {valid_resolutions}")
    if vid_request.duration < 6 or vid_request.duration > 15:
        raise HTTPException(status_code=400, detail="Duration must be between 6 and 15 seconds")

    try:
        def extract_video_url_from_result(payload: Any) -> Optional[str]:
            if not isinstance(payload, dict):
                return None

            video_field = payload.get("video")
            if isinstance(video_field, str) and video_field.strip():
                return video_field
            if isinstance(video_field, dict):
                video_url = video_field.get("url")
                if isinstance(video_url, str) and video_url.strip():
                    return video_url

            response_field = payload.get("response")
            if isinstance(response_field, dict):
                response_video = response_field.get("video")
                if isinstance(response_video, str) and response_video.strip():
                    return response_video
                if isinstance(response_video, dict):
                    response_video_url = response_video.get("url")
                    if isinstance(response_video_url, str) and response_video_url.strip():
                        return response_video_url

                response_url = response_field.get("url")
                if isinstance(response_url, str) and response_url.strip():
                    return response_url

            for key in ["video_url", "url"]:
                value = payload.get(key)
                if isinstance(value, str) and value.strip():
                    return value

            data_field = payload.get("data")
            if isinstance(data_field, list) and data_field:
                first_item = data_field[0]
                if isinstance(first_item, dict):
                    item_url = first_item.get("url")
                    if isinstance(item_url, str) and item_url.strip():
                        return item_url

            return None

        headers = {
            "Authorization": f"Bearer {GROK_API_KEY}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": "grok-imagine-video",
            "prompt": vid_request.prompt,
            "resolution": vid_request.resolution,
            "duration": vid_request.duration,
        }
        
        logger.info(f"Generating video with Grok for user {user_id}")
        
        async with httpx.AsyncClient(timeout=600.0) as client:
            response = await client.post(
                "https://api.x.ai/v1/videos/generations",
                headers=headers,
                json=payload
            )
            
            if response.status_code != 200:
                error_detail = response.text
                logger.error(f"Video generation failed: {error_detail}")
                if is_provider_moderation_error(error_detail):
                    raise HTTPException(status_code=422, detail=moderation_block_detail("video"))
                if "credit" in error_detail.lower() or "rate" in error_detail.lower():
                    raise HTTPException(status_code=429, detail="API credits exhausted. Please try again later.")
                raise HTTPException(status_code=response.status_code, detail=f"Video generation failed: {error_detail[:200]}")
            
            result = response.json()
            logger.info(f"Grok API response: {str(result)[:500]}")
            
            # Grok returns a request_id - need to poll for completion
            request_id = result.get("request_id")
            if request_id:
                logger.info(f"Got request_id: {request_id}, polling for completion...")
                max_attempts = 120  # 10 minutes max
                for attempt in range(max_attempts):
                    await asyncio.sleep(5)
                    
                    status_response = await client.get(
                        f"https://api.x.ai/v1/videos/{request_id}",
                        headers=headers
                    )
                    
                    logger.info(f"Poll {attempt+1}: status={status_response.status_code}")
                    
                    if status_response.status_code == 202:
                        continue  # Still processing
                    elif status_response.status_code == 200:
                        result = status_response.json()
                        logger.info(f"Poll result: {str(result)[:500]}")

                        status = str(result.get("status", "")).lower()
                        if status in ["failed", "error", "cancelled"]:
                            raise HTTPException(status_code=500, detail="Video generation failed on provider")
                        if status in ["pending", "queued", "processing", "running", "in_progress"]:
                            continue

                        if status == "done":
                            break

                        # Some responses may not include status but do include a ready URL
                        if extract_video_url_from_result(result):
                            break

                        continue
                    else:
                        error_text = status_response.text[:500]
                        logger.warning(f"Poll got status {status_response.status_code}: {error_text[:200]}")
                        if status_response.status_code == 400:
                            if is_provider_moderation_error(error_text):
                                raise HTTPException(status_code=422, detail=moderation_block_detail("video"))
                            raise HTTPException(status_code=400, detail=f"Video generation status error: {error_text[:200]}")
                        if status_response.status_code == 429:
                            raise HTTPException(status_code=429, detail="API credits exhausted. Please try again later.")
                        continue
                else:
                    raise HTTPException(status_code=500, detail="Video generation timed out")
            
            # Get the video URL/data from response - handle multiple structures
            video_url = extract_video_url_from_result(result)
            video_base64 = None
            
            logger.info(f"Final result structure: {str(result)[:800]}")
            
            if isinstance(result, dict):
                result_data = result.get("data")
                if isinstance(result_data, list) and result_data:
                    first_item = result_data[0]
                    if isinstance(first_item, dict):
                        video_base64 = first_item.get("b64_json")
            
            if video_url:
                video_response = await client.get(video_url)
                if video_response.status_code != 200:
                    raise HTTPException(status_code=500, detail="Failed to download generated video")
                video_base64 = base64.b64encode(video_response.content).decode('utf-8')
            
            if not video_base64:
                raise HTTPException(status_code=500, detail="No video data in response")
        
        # Store in database
        video_record = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "prompt": vid_request.prompt,
            "video_base64": video_base64,
            "resolution": vid_request.resolution,
            "duration": vid_request.duration,
            "model": "grok-imagine-video",
            "created_at": datetime.utcnow()
        }
        await db.generated_videos.insert_one(video_record)
        
        logger.info(f"Video generated successfully for user {user_id}")
        
        return VideoGenerationResponse(
            id=video_record["id"],
            prompt=vid_request.prompt,
            video_base64=video_base64,
            resolution=vid_request.resolution,
            duration=vid_request.duration
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Video generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Video generation failed: {str(e)[:200]}")

@api_router.get("/generated-videos")
async def get_generated_videos(request: Request, limit: int = 20, session_token: Optional[str] = Cookie(None)):
    # Check for admin key first
    admin_key = request.headers.get("X-Admin-Key")
    if admin_key == ADMIN_SECRET:
        user_id = "admin_master"
    else:
        user = await get_current_user(request, session_token)
        if not user:
            return []
        user_id = user["user_id"]
    
    videos = await db.generated_videos.find(
        {"user_id": user_id}, 
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    return videos

@api_router.delete("/generated-videos/{video_id}")
async def delete_generated_video(request: Request, video_id: str, session_token: Optional[str] = Cookie(None)):
    # Check for admin key first
    admin_key = request.headers.get("X-Admin-Key")
    if admin_key == ADMIN_SECRET:
        user_id = "admin_master"
    else:
        user = await get_current_user(request, session_token)
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        user_id = user["user_id"]
    
    # Only delete if the video belongs to this user
    result = await db.generated_videos.delete_one({"id": video_id, "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Video not found or not authorized")
    return {"message": "Video deleted"}

# ==================== UI CONFIG ENDPOINTS ====================

@api_router.get("/ui-config", response_model=UIConfig)
async def get_ui_config():
    config = await db.ui_config.find_one({})
    if not config:
        default_config = UIConfig()
        await db.ui_config.insert_one(default_config.model_dump())
        return default_config
    return UIConfig(**config)

@api_router.put("/ui-config", response_model=UIConfig)
async def update_ui_config(update: UIConfigUpdate):
    config = await db.ui_config.find_one({})
    if not config:
        config = UIConfig()
        await db.ui_config.insert_one(config.model_dump())
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    await db.ui_config.update_one({}, {"$set": update_data})
    updated_config = await db.ui_config.find_one({})
    return UIConfig(**updated_config)

# ==================== TOOL ENDPOINTS ====================

@api_router.post("/agents/{agent_id}/tools", response_model=Tool)
async def add_tool_to_agent(agent_id: str, tool: Tool):
    agent = await db.agents.find_one({"id": agent_id})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    tools = agent.get("tools", [])
    tools.append(tool.model_dump())
    
    await db.agents.update_one(
        {"id": agent_id},
        {"$set": {"tools": tools, "updated_at": datetime.utcnow()}}
    )
    return tool

@api_router.delete("/agents/{agent_id}/tools/{tool_id}")
async def remove_tool_from_agent(agent_id: str, tool_id: str):
    agent = await db.agents.find_one({"id": agent_id})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    tools = [t for t in agent.get("tools", []) if t.get("id") != tool_id]
    await db.agents.update_one(
        {"id": agent_id},
        {"$set": {"tools": tools, "updated_at": datetime.utcnow()}}
    )
    return {"message": "Tool removed"}

# ==================== STATS ENDPOINT ====================

@api_router.get("/stats")
async def get_stats(agent_id: Optional[str] = None):
    query = {"agent_id": agent_id} if agent_id else {}
    
    total_conversations = await db.conversations.count_documents(query)
    total_images = await db.generated_images.count_documents(query)
    total_memories = await db.memories.count_documents(query)

    message_pipeline = [
        {"$match": query},
        {
            "$project": {
                "message_count": {
                    "$size": {"$ifNull": ["$messages", []]}
                }
            }
        },
        {"$group": {"_id": None, "total_messages": {"$sum": "$message_count"}}},
    ]
    message_result = await db.conversations.aggregate(message_pipeline).to_list(1)
    total_messages = message_result[0]["total_messages"] if message_result else 0
    
    return {
        "total_conversations": total_conversations,
        "total_messages": total_messages,
        "total_images": total_images,
        "total_memories": total_memories,
        "avg_messages_per_convo": round(total_messages / max(total_conversations, 1), 1)
    }

# ==================== CLEANUP INCOGNITO ====================

@api_router.delete("/cleanup/incognito")
async def cleanup_incognito():
    """Delete all incognito conversations"""
    result = await db.conversations.delete_many({"is_incognito": True})
    return {"deleted": result.deleted_count}

# ==================== DOWNLOAD TRACKING ====================

class DownloadTrackRequest(BaseModel):
    image_id: str
    image_prompt: Optional[str] = ""

@api_router.post("/track-download")
async def track_download(request: Request, body: DownloadTrackRequest, session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(request, session_token)
    log = {
        "id": str(uuid.uuid4()),
        "image_id": body.image_id,
        "image_prompt": body.image_prompt,
        "user_id": user["user_id"] if user else "anonymous",
        "user_email": user.get("email", "unknown") if user else "anonymous",
        "downloaded_at": datetime.now(timezone.utc).isoformat(),
        "ip": request.client.host if request.client else "unknown",
    }
    await db.download_logs.insert_one(log)
    return {"status": "logged"}

# ==================== AGENTIC CHAT ENDPOINT ====================

class AgenticChatRequest(BaseModel):
    agent_id: str
    message: str
    user_id: str = "guest"

@api_router.post("/agentic-chat")
async def agentic_chat(body: AgenticChatRequest, request: Request):
    """Chat with an agent that can execute real tools."""
    if not grok_client:
        raise HTTPException(status_code=500, detail="Grok API not configured")
    
    # Get agent
    agent = await db.agents.find_one({"id": body.agent_id})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    agent_prompt = agent.get("system_prompt", "You are a helpful assistant.")
    
    # Check if agent has tool execution enabled
    has_tools = agent.get("has_tools", False)
    
    if has_tools:
        # Run with tool execution
        try:
            result = await run_agent_with_tools(agent_prompt, body.message, agent_id=body.agent_id, max_iterations=5)
        except Exception as e:
            error_msg = str(e)
            if "429" in error_msg or "rate" in error_msg.lower() or "credit" in error_msg.lower():
                raise HTTPException(status_code=429, detail="API credits exhausted. Please try again later.")
            raise HTTPException(status_code=500, detail=f"Agent error: {error_msg[:200]}")
        
        # Store conversation
        conv_id = str(uuid.uuid4())
        conv = {
            "id": conv_id,
            "user_id": body.user_id,
            "agent_id": body.agent_id,
            "messages": [
                {"role": "user", "content": body.message},
                {"role": "assistant", "content": result["response"]}
            ],
            "tool_results": result["tool_results"],
            "iterations": result["iterations"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.agentic_conversations.insert_one(conv)
        
        return {
            "conversation_id": conv_id,
            "message": {
                "id": str(uuid.uuid4()),
                "role": "assistant",
                "content": result["response"],
            },
            "tool_results": result["tool_results"],
            "iterations": result["iterations"]
        }
    else:
        # Regular chat without tools
        response = await grok_client.chat.completions.create(
            model="grok-3",
            messages=[
                {"role": "system", "content": agent_prompt},
                {"role": "user", "content": body.message}
            ],
            max_tokens=2000,
            temperature=0.8
        )
        
        return {
            "message": {
                "id": str(uuid.uuid4()),
                "role": "assistant",
                "content": response.choices[0].message.content,
            }
        }

# Endpoint to create tool-enabled agent
class CreateToolAgentRequest(BaseModel):
    name: str
    system_prompt: str
    description: str = ""
    avatar_color: str = "#8B5CF6"

@api_router.post("/agents/create-tool-agent")
async def create_tool_agent(body: CreateToolAgentRequest):
    """Create an agent with tool execution capabilities."""
    agent_id = str(uuid.uuid4())
    agent = {
        "id": agent_id,
        "name": body.name,
        "system_prompt": body.system_prompt,
        "description": body.description,
        "avatar": body.name[0].upper(),
        "avatar_color": body.avatar_color,
        "personality": "tool-enabled autonomous agent",
        "tools": [],
        "balance": 100.0,
        "has_tools": True,  # Flag for tool execution
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.agents.insert_one(agent)
    return {"id": agent_id, "name": body.name, "status": "created"}


# ==================== DEVIN OPS ====================

async def get_devin_agent_doc() -> Dict[str, Any]:
    await ensure_core_agents()
    devin = await db.agents.find_one({"name": {"$regex": "^(Devin|Devon)$", "$options": "i"}}, {"_id": 0})
    if not devin:
        raise HTTPException(status_code=404, detail="Devin agent not found")
    return devin


@api_router.post("/devin/tasks", response_model=DevinTask)
async def create_devin_task(body: DevinTaskCreate, request: Request, session_token: Optional[str] = Cookie(None)):
    actor = await get_actor_context(request, session_token)
    now = datetime.now(timezone.utc).isoformat()
    risk_level = classify_devin_risk(f"{body.title}\n{body.task}")
    requires_approval = risk_level == "high"

    task_doc = {
        "id": str(uuid.uuid4()),
        "title": body.title.strip(),
        "task": body.task.strip(),
        "priority": body.priority,
        "risk_level": risk_level,
        "requires_approval": requires_approval,
        "is_approved": False,
        "status": "queued",
        "created_by": actor["user_id"],
        "created_at": now,
        "updated_at": now,
        "run_count": 0,
        "last_run_summary": "",
        "last_error": "",
    }

    await db.devin_tasks.insert_one(task_doc)
    return DevinTask(**task_doc)


@api_router.get("/devin/tasks", response_model=List[DevinTask])
async def list_devin_tasks(
    request: Request,
    status: Optional[str] = None,
    session_token: Optional[str] = Cookie(None),
):
    actor = await get_actor_context(request, session_token)
    query: Dict[str, Any] = {} if actor["is_admin"] else {"created_by": actor["user_id"]}
    if status:
        query["status"] = status

    tasks = await db.devin_tasks.find(query, {"_id": 0}).sort("updated_at", -1).to_list(200)
    return [DevinTask(**task) for task in tasks]


@api_router.post("/devin/tasks/{task_id}/approve-risk")
async def approve_devin_task_risk(task_id: str, request: Request, session_token: Optional[str] = Cookie(None)):
    actor = await get_actor_context(request, session_token)
    task = await db.devin_tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.get("created_by") != actor["user_id"] and not actor["is_admin"]:
        raise HTTPException(status_code=403, detail="Not allowed to approve this task")

    await db.devin_tasks.update_one(
        {"id": task_id},
        {"$set": {"is_approved": True, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"status": "approved", "task_id": task_id}


@api_router.post("/devin/tasks/{task_id}/run", response_model=DevinRunRecord)
async def run_devin_task(
    task_id: str,
    body: DevinTaskRunRequest,
    request: Request,
    session_token: Optional[str] = Cookie(None),
):
    actor = await get_actor_context(request, session_token)
    task = await db.devin_tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.get("created_by") != actor["user_id"] and not actor["is_admin"]:
        raise HTTPException(status_code=403, detail="Not allowed to run this task")

    if task.get("requires_approval") and not task.get("is_approved"):
        raise HTTPException(status_code=403, detail="High-risk task requires approval before run")

    devin = await get_devin_agent_doc()
    now = datetime.now(timezone.utc).isoformat()

    await db.devin_tasks.update_one(
        {"id": task_id},
        {"$set": {"status": "running", "updated_at": now, "last_error": ""}},
    )

    run_doc = {
        "id": str(uuid.uuid4()),
        "task_id": task_id,
        "agent_id": devin.get("id", ""),
        "created_by": actor["user_id"],
        "status": "completed",
        "dry_run": body.dry_run,
        "iterations": 0,
        "response": "",
        "response_summary": "",
        "tool_results": [],
        "created_at": now,
    }

    if body.dry_run:
        dry_response = (
            "DRY RUN: Devin would execute this task in staged steps. "
            "No external model/API call was made."
        )
        run_doc.update({
            "iterations": 1,
            "response": dry_response,
            "response_summary": summarize_devin_output(f"{task.get('title', '')}: {dry_response}"),
        })

        await db.devin_runs.insert_one(run_doc)
        await db.devin_tasks.update_one(
            {"id": task_id},
            {
                "$set": {
                    "status": "completed",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "last_run_summary": run_doc["response_summary"],
                },
                "$inc": {"run_count": 1},
            },
        )
        return DevinRunRecord(**run_doc)

    try:
        result = await run_agent_with_tools(
            devin.get("system_prompt", "You are Devin."),
            task.get("task", ""),
            agent_id=devin.get("id"),
            max_iterations=6,
        )

        full_response = result.get("response", "")
        run_doc.update(
            {
                "iterations": int(result.get("iterations", 0)),
                "response": full_response,
                "response_summary": summarize_devin_output(full_response),
                "tool_results": result.get("tool_results", []),
                "status": "completed",
            }
        )

        await db.devin_runs.insert_one(run_doc)
        await db.devin_tasks.update_one(
            {"id": task_id},
            {
                "$set": {
                    "status": "completed",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "last_run_summary": run_doc["response_summary"],
                },
                "$inc": {"run_count": 1},
            },
        )

        return DevinRunRecord(**run_doc)
    except Exception as exc:
        err = str(exc)
        run_doc.update(
            {
                "status": "failed",
                "response": "",
                "response_summary": summarize_devin_output(err),
            }
        )
        await db.devin_runs.insert_one(run_doc)
        await db.devin_tasks.update_one(
            {"id": task_id},
            {
                "$set": {
                    "status": "failed",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "last_error": err[:400],
                }
            },
        )
        raise HTTPException(status_code=500, detail=f"Devin run failed: {err[:200]}")


@api_router.get("/devin/runs", response_model=List[DevinRunRecord])
async def list_devin_runs(
    request: Request,
    task_id: Optional[str] = None,
    session_token: Optional[str] = Cookie(None),
):
    actor = await get_actor_context(request, session_token)
    query: Dict[str, Any] = {}

    if task_id:
        query["task_id"] = task_id

    if not actor["is_admin"]:
        task_ids_docs = await db.devin_tasks.find({"created_by": actor["user_id"]}, {"_id": 0, "id": 1}).to_list(500)
        task_ids = [doc.get("id") for doc in task_ids_docs if doc.get("id")]
        if not task_ids:
            return []

        if "task_id" in query and query["task_id"] not in task_ids:
            return []

        query["task_id"] = query.get("task_id") or {"$in": task_ids}

    runs = await db.devin_runs.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [DevinRunRecord(**run) for run in runs]

# ==================== AGENT MEMORY SYSTEM ====================

class MemoryEntry(BaseModel):
    content: str
    category: str = "general"  # general, fact, preference, context

@api_router.get("/agents/{agent_id}/memories")
async def get_agent_memories(agent_id: str, limit: int = 50):
    """Get an agent's long-term memories."""
    memories = await db.agent_memories.find(
        {"agent_id": agent_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
    return memories

@api_router.post("/agents/{agent_id}/memories")
async def add_agent_memory(agent_id: str, body: MemoryEntry):
    """Add a memory for an agent."""
    memory = {
        "id": str(uuid.uuid4()),
        "agent_id": agent_id,
        "content": body.content,
        "category": body.category,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.agent_memories.insert_one(memory)
    return {"id": memory["id"], "status": "saved"}

@api_router.delete("/agents/{agent_id}/memories/{memory_id}")
async def delete_agent_memory(agent_id: str, memory_id: str):
    """Delete a specific memory."""
    result = await db.agent_memories.delete_one({"id": memory_id, "agent_id": agent_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Memory not found")
    return {"status": "deleted"}

# Helper to get memories for chat context
async def get_memories_for_context(agent_id: str, limit: int = 10) -> str:
    """Get formatted memories for including in chat context."""
    memories = await db.agent_memories.find(
        {"agent_id": agent_id},
        {"_id": 0, "content": 1, "category": 1}
    ).sort("created_at", -1).to_list(limit)
    
    if not memories:
        return ""
    
    memory_text = "\n\n[LONG-TERM MEMORIES]\n"
    for m in memories:
        memory_text += f"- [{m['category']}] {m['content']}\n"
    return memory_text

# ==================== EXPORT CONVERSATIONS ====================

@api_router.get("/conversations/{conv_id}/export")
async def export_conversation(conv_id: str, format: str = "markdown"):
    """Export a conversation as markdown or JSON."""
    conv = await db.conversations.find_one({"id": conv_id}, {"_id": 0})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    if format == "json":
        return conv
    
    # Markdown format
    md = f"# Conversation Export\n\n"
    md += f"**Date**: {conv.get('created_at', 'Unknown')}\n"
    md += f"**Agent**: {conv.get('agent_id', 'Unknown')}\n\n"
    md += "---\n\n"
    
    for msg in conv.get("messages", []):
        role = msg.get("role", "unknown").upper()
        content = msg.get("content", "")
        md += f"**{role}**:\n{content}\n\n"
    
    return {"markdown": md, "conversation_id": conv_id}

# ==================== PENDING CHANGES APPROVAL SYSTEM ====================

@api_router.get("/pending-changes")
async def get_pending_changes():
    """Get all pending changes awaiting approval."""
    changes = await db.pending_changes.find({"status": "pending"}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return changes

@api_router.post("/pending-changes/{change_id}/approve")
async def approve_change(change_id: str, request: Request):
    """Approve a pending change."""
    change = await db.pending_changes.find_one({"id": change_id})
    if not change:
        raise HTTPException(status_code=404, detail="Change not found")
    
    if change["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Change already {change['status']}")
    
    try:
        if change["change_type"] == "create_agent":
            agent_data = json.loads(change["new_value"])
            new_agent = {
                "id": str(uuid.uuid4()),
                "name": agent_data["name"],
                "system_prompt": agent_data["system_prompt"],
                "avatar": agent_data["name"][0].upper(),
                "avatar_color": "#22C55E",
                "personality": "created by agent",
                "tools": [],
                "balance": 50.0,
                "has_tools": agent_data.get("has_tools", False),
                "status": "active",
                "created_by": change["proposer_id"],
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.agents.insert_one(new_agent)
            
        elif change["change_type"] in ["prompt", "self_improvement"]:
            await db.agents.update_one(
                {"id": change["target_agent_id"]},
                {"$set": {"system_prompt": change["new_value"]}}
            )
        
        await db.pending_changes.update_one(
            {"id": change_id},
            {"$set": {"status": "approved", "approved_at": datetime.now(timezone.utc).isoformat()}}
        )
        
        await db.agent_audit_log.insert_one({
            "id": str(uuid.uuid4()),
            "action": "approve_change",
            "change_id": change_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        
        return {"status": "approved", "change_id": change_id}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/pending-changes/{change_id}/reject")
async def reject_change(change_id: str, request: Request):
    """Reject a pending change."""
    change = await db.pending_changes.find_one({"id": change_id})
    if not change:
        raise HTTPException(status_code=404, detail="Change not found")
    
    await db.pending_changes.update_one(
        {"id": change_id},
        {"$set": {"status": "rejected", "rejected_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    await db.agent_audit_log.insert_one({
        "id": str(uuid.uuid4()),
        "action": "reject_change",
        "change_id": change_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    
    return {"status": "rejected", "change_id": change_id}

@api_router.get("/agent-audit-log")
async def get_audit_log():
    """Get the agent audit log."""
    logs = await db.agent_audit_log.find({}, {"_id": 0}).sort("timestamp", -1).to_list(100)
    return logs

# ==================== ADMIN ENDPOINTS ====================

async def require_admin(request: Request):
    if not ADMIN_SECRET:
        raise HTTPException(status_code=500, detail="ADMIN_SECRET is not configured")
    admin_key = request.headers.get("X-Admin-Key", "")
    if admin_key != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Admin access required")

@api_router.get("/admin/users")
async def admin_get_users(request: Request):
    await require_admin(request)
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    result = []
    for u in users:
        uid = u.get("user_id", "")
        conv_count = await db.conversations.count_documents({"user_id": uid})
        image_count = await db.generated_images.count_documents({"user_id": uid})
        dl_count = await db.download_logs.count_documents({"user_id": uid})
        result.append({**u, "conversation_count": conv_count, "image_count": image_count, "download_count": dl_count})
    return result

@api_router.get("/admin/users/{user_id}/conversations")
async def admin_get_user_conversations(user_id: str, request: Request):
    await require_admin(request)
    convos = await db.conversations.find({"user_id": user_id}, {"_id": 0}).sort("updated_at", -1).to_list(200)
    return convos

@api_router.get("/admin/users/{user_id}/images")
async def admin_get_user_images(user_id: str, request: Request):
    await require_admin(request)
    images = await db.generated_images.find({"user_id": user_id}, {"_id": 0, "image_base64": 0}).sort("created_at", -1).to_list(200)
    return images

@api_router.get("/admin/download-logs")
async def admin_get_download_logs(request: Request):
    await require_admin(request)
    logs = await db.download_logs.find({}, {"_id": 0}).sort("downloaded_at", -1).to_list(1000)
    return logs

@api_router.get("/admin/stats")
async def admin_get_stats(request: Request):
    await require_admin(request)
    total_users = await db.users.count_documents({})
    total_convos = await db.conversations.count_documents({})
    total_images = await db.generated_images.count_documents({})
    total_downloads = await db.download_logs.count_documents({})
    return {
        "total_users": total_users,
        "total_conversations": total_convos,
        "total_images": total_images,
        "total_downloads": total_downloads,
    }

# Include router and middleware
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
