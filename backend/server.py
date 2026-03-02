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
import re
import hashlib
import secrets

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Grok API setup
GROK_API_KEY = os.environ.get('GROK_API_KEY', '')
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
    is_template: bool = False
    template_category: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class AgentConfigCreate(BaseModel):
    name: Optional[str] = "Nova"
    avatar: Optional[str] = "planet"
    avatar_color: Optional[str] = "#7C7C8A"
    system_prompt: Optional[str] = None
    personality: Optional[str] = "Friendly and professional"
    model: Optional[str] = "grok-3"
    temperature: Optional[float] = 0.7
    adult_mode: Optional[bool] = False
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

@api_router.get("/agents", response_model=List[AgentConfig])
async def get_agents(include_templates: bool = False):
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

# ==================== CHAT ENDPOINT ====================

@api_router.post("/chat", response_model=ChatResponse)
async def chat(http_request: Request, request: ChatRequest, session_token: Optional[str] = Cookie(None)):
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
    
    if request.include_memory and not request.is_incognito:
        memories = await db.memories.find({"agent_id": request.agent_id}).sort("importance", -1).limit(10).to_list(10)
        if memories:
            memory_context = "\n".join([f"- {m['content']}" for m in memories])
            system_prompt += f"\n\nRelevant memories about this user:\n{memory_context}"
    
    system_prompt += f"\n\nYour personality: {agent_config.personality}"
    
    if agent_config.adult_mode:
        system_prompt += "\n\nAdult content mode is enabled. You may generate mature content if requested."
    
    # Prepare messages for API
    messages_for_api = [{"role": "system", "content": system_prompt}]
    for msg in convo.messages[-15:]:
        if msg.role in ["user", "assistant"]:
            messages_for_api.append({"role": msg.role, "content": msg.content})
    
    # Call Grok API
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
                except json.JSONDecodeError:
                    pass

            # Clean tool tags from response
            clean_content = re.sub(r'<tool>.*?</tool>', '', assistant_content, flags=re.DOTALL).strip()
            if clean_content:
                assistant_content = clean_content

        except Exception as e:
            logger.error(f"Grok API error: {e}")
            assistant_content = f"I apologize, but I encountered an error: {str(e)}"
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
                raise HTTPException(status_code=response.status_code, detail=f"Image generation failed: {error_detail}")

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
    except Exception as e:
        logger.error(f"Image generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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

from emergentintegrations.llm.openai.video_generation import OpenAIVideoGeneration

class VideoGenerationRequest(BaseModel):
    prompt: str
    size: str = "1280x720"  # "1280x720", "1792x1024", "1024x1792", "1024x1024"
    duration: int = 4  # 4, 8, or 12 seconds
    model: str = "sora-2"  # "sora-2" or "sora-2-pro"

class VideoGenerationResponse(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    prompt: str
    video_base64: str
    size: str
    duration: int
    status: str = "completed"
    created_at: datetime = Field(default_factory=datetime.utcnow)

@api_router.post("/generate-video", response_model=VideoGenerationResponse)
async def generate_video(request: Request, vid_request: VideoGenerationRequest, session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(request, session_token)
    user_id = user["user_id"] if user else "anonymous"

    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")

    # Validate parameters
    valid_sizes = ["1280x720", "1792x1024", "1024x1792", "1024x1024"]
    valid_durations = [4, 8, 12]
    valid_models = ["sora-2", "sora-2-pro"]
    
    if vid_request.size not in valid_sizes:
        raise HTTPException(status_code=400, detail=f"Invalid size. Must be one of: {valid_sizes}")
    if vid_request.duration not in valid_durations:
        raise HTTPException(status_code=400, detail=f"Invalid duration. Must be one of: {valid_durations}")
    if vid_request.model not in valid_models:
        raise HTTPException(status_code=400, detail=f"Invalid model. Must be one of: {valid_models}")

    try:
        # Run video generation in thread pool to avoid blocking
        import asyncio
        from concurrent.futures import ThreadPoolExecutor
        
        def generate_video_sync():
            video_gen = OpenAIVideoGeneration(api_key=EMERGENT_LLM_KEY)
            video_bytes = video_gen.text_to_video(
                prompt=vid_request.prompt,
                model=vid_request.model,
                size=vid_request.size,
                duration=vid_request.duration,
                max_wait_time=600
            )
            return video_bytes
        
        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor() as executor:
            video_bytes = await loop.run_in_executor(executor, generate_video_sync)
        
        if not video_bytes:
            raise HTTPException(status_code=500, detail="Video generation failed - no data returned")
        
        # Convert to base64
        video_base64 = base64.b64encode(video_bytes).decode('utf-8')
        
        # Store in database
        video_record = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "prompt": vid_request.prompt,
            "video_base64": video_base64,
            "size": vid_request.size,
            "duration": vid_request.duration,
            "model": vid_request.model,
            "created_at": datetime.utcnow()
        }
        await db.generated_videos.insert_one(video_record)
        
        logger.info(f"Video generated successfully for user {user_id}")
        
        return VideoGenerationResponse(
            id=video_record["id"],
            prompt=vid_request.prompt,
            video_base64=video_base64,
            size=vid_request.size,
            duration=vid_request.duration
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Video generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Video generation failed: {str(e)}")

@api_router.get("/generated-videos")
async def get_generated_videos(request: Request, limit: int = 20, session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(request, session_token)
    if not user:
        return []
    videos = await db.generated_videos.find(
        {"user_id": user["user_id"]}, 
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    return videos

@api_router.delete("/generated-videos/{video_id}")
async def delete_generated_video(video_id: str):
    result = await db.generated_videos.delete_one({"id": video_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Video not found")
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
    
    conversations = await db.conversations.find(query).to_list(1000)
    images = await db.generated_images.find(query).to_list(1000)
    memories = await db.memories.find(query).to_list(1000)
    
    total_messages = sum(len(c.get("messages", [])) for c in conversations)
    
    return {
        "total_conversations": len(conversations),
        "total_messages": total_messages,
        "total_images": len(images),
        "total_memories": len(memories),
        "avg_messages_per_convo": round(total_messages / max(len(conversations), 1), 1)
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

# ==================== ADMIN ENDPOINTS ====================

ADMIN_SECRET = "forge_master_2025"

async def require_admin(request: Request):
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
