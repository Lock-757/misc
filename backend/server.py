from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime
from openai import AsyncOpenAI
import json
import httpx
import base64

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Grok API setup (xAI uses OpenAI-compatible API)
GROK_API_KEY = os.environ.get('GROK_API_KEY', '')
grok_client = AsyncOpenAI(
    api_key=GROK_API_KEY,
    base_url="https://api.x.ai/v1"
) if GROK_API_KEY else None

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

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
    avatar: str = "robot"
    avatar_color: str = "#8B5CF6"
    system_prompt: str = "You are Nova, a highly intelligent AI assistant capable of generating tools dynamically to solve any problem. You are helpful, creative, and precise."
    personality: str = "Friendly and professional"
    model: str = "grok-3-latest"
    temperature: float = 0.7
    adult_mode: bool = False  # Enable adult/NSFW content
    tools: List[Tool] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class AgentConfigCreate(BaseModel):
    name: Optional[str] = "Nova"
    avatar: Optional[str] = "robot"
    avatar_color: Optional[str] = "#8B5CF6"
    system_prompt: Optional[str] = "You are Nova, a highly intelligent AI assistant capable of generating tools dynamically to solve any problem."
    personality: Optional[str] = "Friendly and professional"
    model: Optional[str] = "grok-3-latest"
    temperature: Optional[float] = 0.7
    adult_mode: Optional[bool] = False

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
    role: str  # 'user', 'assistant', 'system', 'tool'
    content: str
    tool_calls: List[Dict[str, Any]] = []
    tool_results: List[Dict[str, Any]] = []
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class Conversation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str
    title: str = "New Conversation"
    messages: List[Message] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ChatRequest(BaseModel):
    agent_id: str
    conversation_id: Optional[str] = None
    message: str

class ChatResponse(BaseModel):
    conversation_id: str
    message: Message
    tools_generated: List[Tool] = []

class UIConfig(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    theme: str = "dark"
    primary_color: str = "#8B5CF6"
    accent_color: str = "#06B6D4"
    background_gradient: List[str] = ["#0F0F1A", "#1A1A2E", "#16213E"]
    chat_bubble_user: str = "#8B5CF6"
    chat_bubble_assistant: str = "#1E1E2E"
    font_size: str = "medium"
    animations_enabled: bool = True
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

# ==================== AGENT ENDPOINTS ====================

@api_router.get("/")
async def root():
    return {"message": "Agent API Running", "version": "1.0.0"}

@api_router.post("/agents", response_model=AgentConfig)
async def create_agent(config: AgentConfigCreate):
    agent = AgentConfig(**config.model_dump())
    await db.agents.insert_one(agent.model_dump())
    return agent

@api_router.get("/agents", response_model=List[AgentConfig])
async def get_agents():
    agents = await db.agents.find().to_list(100)
    return [AgentConfig(**a) for a in agents]

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
    return {"message": "Agent deleted"}

# ==================== CONVERSATION ENDPOINTS ====================

@api_router.get("/conversations", response_model=List[Conversation])
async def get_conversations(agent_id: Optional[str] = None):
    query = {"agent_id": agent_id} if agent_id else {}
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

# ==================== CHAT ENDPOINT ====================

@api_router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    # Get or create agent
    agent = await db.agents.find_one({"id": request.agent_id})
    if not agent:
        # Create default agent if not exists
        default_agent = AgentConfig(id=request.agent_id)
        await db.agents.insert_one(default_agent.model_dump())
        agent = default_agent.model_dump()
    
    agent_config = AgentConfig(**agent)
    
    # Get or create conversation
    if request.conversation_id:
        convo = await db.conversations.find_one({"id": request.conversation_id})
        if not convo:
            convo = Conversation(id=request.conversation_id, agent_id=request.agent_id)
            await db.conversations.insert_one(convo.model_dump())
        else:
            convo = Conversation(**convo)
    else:
        convo = Conversation(agent_id=request.agent_id, title=request.message[:50])
        await db.conversations.insert_one(convo.model_dump())
    
    # Add user message
    user_message = Message(role="user", content=request.message)
    convo.messages.append(user_message)
    
    # Prepare messages for Grok
    system_prompt = f"""{agent_config.system_prompt}

You have the ability to generate tools dynamically. When you need to perform a specific task, you can create a tool by specifying:
- Tool name
- Description
- Parameters
- Implementation logic

Format tool generation as JSON within <tool> tags when needed:
<tool>
{{
  "name": "tool_name",
  "description": "What the tool does",
  "parameters": {{}},
  "result": "The result of executing this tool"
}}
</tool>

Your personality: {agent_config.personality}"""
    
    messages_for_api = [{"role": "system", "content": system_prompt}]
    
    # Add conversation history (last 10 messages for context)
    for msg in convo.messages[-10:]:
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
            
            # Parse any generated tools
            import re
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
            
            # Clean up tool tags from response for display
            clean_content = re.sub(r'<tool>.*?</tool>', '', assistant_content, flags=re.DOTALL).strip()
            if clean_content:
                assistant_content = clean_content
                
        except Exception as e:
            logger.error(f"Grok API error: {e}")
            assistant_content = f"I apologize, but I encountered an error: {str(e)}. Please check the API configuration."
    else:
        assistant_content = "I'm currently unable to process requests. Please configure the Grok API key."
    
    # Create assistant message
    assistant_message = Message(
        role="assistant",
        content=assistant_content,
        tool_calls=[t.model_dump() for t in tools_generated]
    )
    convo.messages.append(assistant_message)
    convo.updated_at = datetime.utcnow()
    
    # Update conversation in DB
    await db.conversations.update_one(
        {"id": convo.id},
        {"$set": convo.model_dump()}
    )
    
    return ChatResponse(
        conversation_id=convo.id,
        message=assistant_message,
        tools_generated=tools_generated
    )

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

# Include router and middleware
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
