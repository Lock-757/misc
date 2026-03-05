# Devin Lab - Product Requirements Document

## Original Problem Statement
A focused AI agent app centered on "Devin" - an autonomous super-agent with:
- Conversational chat interface (NEW)
- Task-based workflow for discrete jobs
- Shell commands & file operations
- Browser/screen control
- Self-tasking with approval gates
- Persistent memory
- Permission system for capability control

## User Modes

### 1. Chat Mode (Default)
For natural conversation with Devin:
- Back-and-forth dialogue
- Tool execution shown inline
- Chat history persisted locally
- Quick suggestion prompts

### 2. Task Mode
For discrete, trackable work:
- Create tasks with title/description
- Priority levels (low/normal/high)
- Task chaining for workflows
- Quality scoring & auto-retry

## Core Capabilities

### File & Shell Operations
- Shell command execution
- File read/write/edit
- Search in files

### Browser/Screen Control
- Navigate URLs, take screenshots
- Click elements, type into inputs
- Read page content, scroll

### Self-Tasking
- Devin can create tasks for himself
- **ALWAYS requires approval** before execution
- Cannot bypass approval gate

### Persistent Memory
- Auto-injected before each interaction
- Categories: learning, fact, preference
- Viewable/deletable in Memory tab

### Permission System
User controls capabilities via toggles:
- Self-Modification is OFF by default
- Devin cannot grant himself permissions

## Current Architecture

### Frontend (6 Tabs)
```
/app/frontend/app/index.tsx
├── Chat Tab     - Conversational interface (DEFAULT)
├── Task Tab     - Create discrete tasks
├── Queue Tab    - View/run pending tasks
├── History Tab  - Run history with quality scores
├── Memory Tab   - View Devin's memories
└── Perms Tab    - Control permissions
```

### Backend APIs
```
POST   /api/agentic-chat             # Chat with Devin
POST   /api/devin/tasks              # Create task
GET    /api/devin/tasks              # List tasks  
DELETE /api/devin/tasks/{id}         # Delete task
POST   /api/devin/tasks/{id}/approve-risk  
POST   /api/devin/tasks/{id}/run     # Execute task
GET    /api/devin/runs               # Run history
GET    /api/agents/{id}/memories     # View memories
```

## Completed (March 5, 2026)
- [x] Stripped to Devin-focused app
- [x] Admin-only password gate
- [x] Enhanced reasoning framework
- [x] Quality scoring & auto-retry
- [x] Memory injection before runs
- [x] Browser automation tools
- [x] Task chaining support
- [x] Memory viewer tab
- [x] Permission system UI
- [x] Self-tasking with approval gates
- [x] **Chat tab with conversational interface** (NEW)

## Next Steps (P0)
1. **Backend permission enforcement** - Block tools if permission disabled
2. **Device control tools** - Camera, notifications, app launching
3. **Real-time execution logs** - Stream tool outputs live

## Environment Variables
- `EXPO_PUBLIC_ADMIN_SECRET` - Admin password
- `GROK_API_KEY` - Grok LLM API key  
- `MONGO_URL` - MongoDB connection

## Credentials
- **Admin Password**: `forge_master_2025`
