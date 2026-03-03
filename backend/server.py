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

# Using Grok Imagine Video API from xAI
GROK_VIDEO_API_URL = "https://api.x.ai/v1/videos/generations"

class VideoGenerationRequest(BaseModel):
    prompt: str
    resolution: str = "720p"  # "480p", "720p"
    duration: int = 6  # 6 to 15 seconds
    spicy_mode: bool = False  # Allow more adult content for admin

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
        raise HTTPException(status_code=500, detail="GROK_API_KEY not configured")

    # Validate parameters
    valid_resolutions = ["480p", "720p"]
    if vid_request.resolution not in valid_resolutions:
        raise HTTPException(status_code=400, detail=f"Invalid resolution. Must be one of: {valid_resolutions}")
    if vid_request.duration < 6 or vid_request.duration > 15:
        raise HTTPException(status_code=400, detail="Duration must be between 6 and 15 seconds")

    try:
        # Prepare the request to Grok Imagine Video API
        headers = {
            "Authorization": f"Bearer {GROK_API_KEY}",
            "Content-Type": "application/json"
        }
        
        # Map resolution to aspect ratio
        aspect_ratio = "16:9" if vid_request.resolution == "720p" else "16:9"
        
        # Build payload according to xAI API docs
        payload = {
            "model": "grok-imagine-video",
            "prompt": vid_request.prompt,
            "resolution": vid_request.resolution,
            "duration": vid_request.duration,
            "aspect_ratio": aspect_ratio,
        }
        
        logger.info(f"Generating video with Grok Imagine for user {user_id}")
        logger.info(f"Payload: {payload}")
        
        async with httpx.AsyncClient(timeout=600.0) as client:
            # Start video generation
            response = await client.post(
                GROK_VIDEO_API_URL,
                headers=headers,
                json=payload
            )
            
            if response.status_code != 200:
                error_detail = response.json().get("error", {}).get("message", response.text)
                raise HTTPException(status_code=response.status_code, detail=f"Grok API error: {error_detail}")
            
            result = response.json()
            logger.info(f"Grok API response: {str(result)[:500]}")
            
            # Grok returns a request_id - need to poll for completion
            request_id = result.get("request_id")
            if request_id:
                logger.info(f"Got request_id: {request_id}, polling for completion...")
                max_attempts = 120  # 10 minutes max (video gen can take a while)
                for attempt in range(max_attempts):
                    await asyncio.sleep(5)  # Wait 5 seconds between polls
                    
                    status_response = await client.get(
                        f"https://api.x.ai/v1/videos/{request_id}",
                        headers=headers
                    )
                    
                    logger.info(f"Poll attempt {attempt + 1}: status {status_response.status_code}")
                    
                    if status_response.status_code == 202:
                        # Still processing
                        continue
                    elif status_response.status_code == 200:
                        result = status_response.json()
                        logger.info(f"Video ready: {str(result)[:500]}")
                        break
                    else:
                        logger.error(f"Poll error: {status_response.text}")
                        continue
                else:
                    raise HTTPException(status_code=500, detail="Video generation timed out")
            
            # Get the video URL from response
            video_url = None
            if "response" in result and "video" in result["response"]:
                video_url = result["response"]["video"].get("url")
            elif "video_url" in result:
                video_url = result.get("video_url")
            elif "url" in result:
                video_url = result.get("url")
            
            if not video_url:
                # Check if video is directly in response as base64
                video_b64 = result.get("video_base64") or result.get("data", [{}])[0].get("b64_json")
                if video_b64:
                    video_base64 = video_b64
                else:
                    raise HTTPException(status_code=500, detail="No video URL or data in response")
            else:
                # Download the video
                video_response = await client.get(video_url)
                if video_response.status_code != 200:
                    raise HTTPException(status_code=500, detail="Failed to download generated video")
                video_base64 = base64.b64encode(video_response.content).decode('utf-8')
        
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
        raise HTTPException(status_code=500, detail=f"Video generation failed: {str(e)}")

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
