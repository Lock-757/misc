# Devin Lab - Product Requirements Document

## Original Problem Statement
A focused AI agent app centered on "Devin" - an autonomous super-agent with:
- Shell commands & file operations
- Browser/screen control
- Self-tasking with approval gates
- Persistent memory
- Permission system for capability control
- Task chaining for complex workflows

## Core Capabilities

### 1. File & Shell Operations
- Shell command execution (timeout: 30s)
- File read/write/edit
- Search in files (grep)
- Find files by pattern

### 2. Browser/Screen Control
Devin can interact with web interfaces:
- `<browser_go url="..."/>` - Navigate to URL
- `<browser_screenshot/>` - Capture current page
- `<browser_click selector="..." text="..."/>` - Click elements
- `<browser_type selector="..." text="..."/>` - Type into inputs
- `<browser_read/>` - Get page text content
- `<browser_elements/>` - List clickable items
- `<browser_wait/>` - Wait for elements
- `<browser_scroll/>` - Scroll page

### 3. Self-Tasking (NEW)
- `<create_task title="..." priority="...">description</create_task>`
- Self-created tasks are prefixed with `[Self]`
- **ALWAYS require user approval** before execution
- Devin cannot bypass approval gate

### 4. Persistent Memory
- Memories auto-injected before each run
- Categories: learning, fact, preference, error
- Viewable/deletable in Memory tab

### 5. Task Chaining
- Tasks can link via `next_task_id`
- Auto-triggers next task on completion
- `chain_on_success_only` flag for conditional chains

### 6. Quality Scoring & Auto-Retry
- Each run scored 0-100 (Grade A-F)
- Auto-retries up to 3 times if score < 40
- Retries include context about previous failure

### 7. Permission System (NEW)
User controls what Devin can do:

| Permission | Default | Requires Approval |
|------------|---------|-------------------|
| Shell Commands | ON | No |
| File Read | ON | No |
| File Write | ON | Yes |
| Browser Control | ON | No |
| Self-Tasking | ON | Yes |
| Self-Modification | **OFF** | Yes |
| Camera Access | OFF | Yes |
| Send Notifications | ON | No |
| Launch Apps | OFF | Yes |
| Contacts Access | OFF | Yes |
| Calendar Access | OFF | Yes |
| Location Access | OFF | Yes |

**Key Safeguard**: Devin CANNOT grant himself new permissions - only the user can enable/disable capabilities.

## Current Architecture

### Frontend (5 Tabs)
```
/app/frontend/app/index.tsx
├── New Tab      - Create tasks
├── Queue Tab    - View/run tasks
├── History Tab  - Run history with quality scores
├── Memory Tab   - View Devin's persistent memories
└── Permissions  - Control Devin's capabilities
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
DELETE /api/agents/{id}/memories/{mid}  # Delete memory
```

## Completed (March 5, 2026)
- [x] Stripped to single-page Devin Lab
- [x] Admin-only password gate
- [x] Enhanced reasoning framework
- [x] Quality scoring (0-100, Grade A-F)
- [x] Auto-retry with max 3 attempts
- [x] Memory injection before runs
- [x] Browser automation (8 tools)
- [x] Task chaining support
- [x] **Memory viewer tab** (NEW)
- [x] **Task chaining UI** (NEW)
- [x] **Self-tasking with approval gates** (NEW)
- [x] **Permission system UI** (NEW)

## Database Collections
- `devin_tasks` - Task queue with chaining
- `devin_runs` - Execution history with quality
- `agent_memories` - Persistent memory
- `agents` - Agent configurations

## Environment Variables
- `EXPO_PUBLIC_ADMIN_SECRET` - Admin password
- `GROK_API_KEY` - Grok LLM API key  
- `MONGO_URL` - MongoDB connection

## Credentials
- **Admin Password**: `forge_master_2025`

## Next Steps (P0)
1. **Real-time execution logs** - Stream tool outputs as they happen
2. **Device control tools** - Camera, notifications, app launching
3. **Backend permission enforcement** - Actually check permissions before tool execution

## Future Enhancements (P1/P2)
- Screenshot gallery viewer
- Task templates for common operations
- Scheduled/recurring tasks
- Export run history
- Voice commands for Devin
