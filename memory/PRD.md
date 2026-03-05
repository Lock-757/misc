# Devin Lab - Product Requirements Document

## Original Problem Statement
A focused AI agent app centered on "Devin" - a super-agent capable of:
- Running shell commands
- Reading/writing files  
- **Browser/screen control** (NEW)
- Task chaining (NEW)
- Persistent memory (ENHANCED)
- Auto-retry with quality scoring (NEW)
- All operations gated by user approval for safety

## Core Capabilities

### 1. File & Shell Operations
- Shell command execution (timeout: 30s)
- File read/write/edit
- Search in files (grep)
- Find files by pattern

### 2. Browser/Screen Control (NEW)
Devin can interact with web interfaces like a human:
- `<browser_go url="..."/>` - Navigate to URL
- `<browser_screenshot/>` - Capture current page
- `<browser_click selector="..." text="..."/>` - Click elements
- `<browser_type selector="..." text="..."/>` - Type into inputs
- `<browser_read/>` - Get page text content
- `<browser_elements/>` - List clickable items
- `<browser_wait/>` - Wait for elements
- `<browser_scroll/>` - Scroll page

### 3. Persistent Memory
- Memories injected into context before each run
- Categories: learning, fact, preference, context
- Survives across sessions
- Auto-saves learnings from each task

### 4. Task Chaining (NEW)
- Tasks can have `next_task_id` to auto-trigger after completion
- `chain_on_success_only` flag controls conditional chaining
- Enables complex multi-step workflows

### 5. Quality Scoring & Auto-Retry
- Each run scored 0-100 (Grade A-F)
- Factors: tool usage, errors, verification, memory, response detail
- Auto-retries up to 3 times if score < 40
- Retries include context about previous failure

### 6. Reasoning Framework
Built into system prompt:
1. UNDERSTAND - Restate the goal
2. PLAN - Break into steps
3. EXECUTE - Run each step
4. VERIFY - Check results
5. REFLECT - Save learnings

## Current Architecture

### Frontend (Lean)
```
/app/frontend/app/
├── _layout.tsx     # Minimal layout
└── index.tsx       # Devin Lab - single page app
```

### Backend APIs
```
POST   /api/devin/tasks              # Create task
GET    /api/devin/tasks              # List tasks  
DELETE /api/devin/tasks/{id}         # Delete task
POST   /api/devin/tasks/{id}/approve-risk  # Approve high-risk
POST   /api/devin/tasks/{id}/run     # Execute (dry/live)
GET    /api/devin/runs               # Run history
GET    /api/agents/{id}/memories     # View memories
POST   /api/agents/{id}/memories     # Add memory
DELETE /api/agents/{id}/memories/{mid}  # Delete memory
```

## Completed (March 5, 2026)
- [x] Stripped 20+ pages to single Devin Lab page
- [x] Admin-only password gate
- [x] Enhanced reasoning framework in system prompt
- [x] Quality scoring (0-100, Grade A-F)
- [x] Auto-retry with max 3 attempts
- [x] Memory injection before runs
- [x] Browser automation tools (8 new tools)
- [x] Task chaining support
- [x] Browser tool parsing in tool executor

## Database Collections
- `devin_tasks` - Task queue with chaining fields
- `devin_runs` - Execution history with quality scores
- `agent_memories` - Persistent memory storage
- `agents` - Agent configurations

## Environment Variables
- `EXPO_PUBLIC_ADMIN_SECRET` - Admin password
- `GROK_API_KEY` - Grok LLM API key  
- `MONGO_URL` - MongoDB connection

## Credentials
- **Admin Password**: `forge_master_2025`

## Next Steps (P0)
1. **Memory viewer in UI** - See Devin's memories in the app
2. **Chain builder UI** - Visual task chaining interface
3. **Real-time execution logs** - Stream tool outputs as they happen

## Future Enhancements (P1/P2)
- Task templates for common operations
- Scheduled/recurring tasks
- Export run history
- Screenshot gallery viewer
