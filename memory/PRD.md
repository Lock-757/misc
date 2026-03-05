# Devin Lab - Product Requirements Document

## Original Problem Statement
A focused AI agent app centered on "Devin" - an autonomous super-agent with:
- Conversational chat interface
- Task-based workflow for discrete jobs
- Shell commands & file operations
- Browser/screen control
- Self-tasking with approval gates
- Persistent memory
- Permission system with backend enforcement

## User Modes

### 1. Chat Mode (Default)
For natural conversation with Devin:
- Back-and-forth dialogue
- Clean responses (no XML tags shown)
- Tool executions shown via badge
- Chat history persisted locally

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

### Persistent Memory
- Auto-injected before each interaction
- Categories: learning, fact, preference
- Viewable/deletable in Memory tab

### Permission System (Backend Enforced)
| Permission | Default | Maps to Tools |
|------------|---------|---------------|
| Shell Commands | ON | shell |
| File Read | ON | open_file, find_* |
| File Write | ON | create_file, str_replace |
| Browser Control | ON | browser_* |
| Self-Tasking | ON | create_task |
| Self-Modification | **OFF** | self_improve |
| Camera | OFF | device_camera |
| Notifications | ON | device_notify |
| App Launch | OFF | device_launch_app |

**Key**: When permission is OFF, tool returns `[Permission Denied]` and Devin asks user to enable it.

## Architecture

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
GET    /api/devin/permissions        # Get permissions
POST   /api/devin/permissions        # Sync permissions
GET    /api/agents/{id}/memories     # View memories
```

## Completed (March 5, 2026)
- [x] Lean single-page app with 6 tabs
- [x] Chat interface with clean responses
- [x] Task workflow with chaining
- [x] Quality scoring & auto-retry
- [x] Browser automation tools
- [x] Self-tasking with approval gates
- [x] **Permission enforcement** (backend blocks tools)
- [x] **Permission sync API** (frontend → backend)
- [x] **Response cleanup** (no XML tags shown to user)
- [x] **Device tool placeholders** (camera, notifications, app launch)

## Testing Results
- **Backend**: 100% (20/20 tests passed)
- Test file: `/app/backend/tests/test_devin_lab.py`

## Credentials
- **Admin Password**: `forge_master_2025`
- **Header**: `X-Admin-Key: forge_master_2025`

## Next Steps (P1/P2)
- Real-time execution log streaming
- Full device control (requires native mobile modules)
- Voice commands
