# Devin Lab - Product Requirements Document

## Original Problem Statement
The user wants a focused AI agent app centered on "Devin" - a super-agent capable of:
- Running shell commands
- Reading/writing files
- Executing complex automation tasks
- Self-improvement capabilities
- All operations gated by user approval for safety

The user explicitly requested to **strip away non-essentials** and focus entirely on Devin's capabilities.

## What Was Removed (Decluttered)
- Multi-agent system (agent creation, personalities, agent-to-agent communication)
- Tool trading/credit economy between agents
- Image/Video generation (Grok features)
- Complex user authentication (email/password, Google Sign-in)
- 20+ frontend pages (agents, settings, history, templates, bookmarks, etc.)
- Agent memories and collective knowledge UI

## Current Architecture

### Frontend (Lean)
```
/app/frontend/app/
├── _layout.tsx     # Minimal layout with single route
└── index.tsx       # Devin Lab - all-in-one interface
```

### Backend (Core Devin APIs)
```
/app/backend/server.py
├── POST /api/devin/tasks          # Create task
├── GET  /api/devin/tasks          # List tasks
├── POST /api/devin/tasks/{id}/approve-risk  # Approve high-risk
├── DELETE /api/devin/tasks/{id}   # Delete task
├── POST /api/devin/tasks/{id}/run # Execute task (dry/live)
└── GET  /api/devin/runs           # Run history
```

### Core Features
1. **Admin-Only Access** - Simple password gate (`forge_master_2025`)
2. **Task Creation** - Title, description, priority (low/normal/high)
3. **Risk Assessment** - Automatic classification (low/medium/high)
4. **Approval Workflow** - High-risk tasks require explicit approval
5. **Dry Run Mode** - Preview execution without credits
6. **Live Run Mode** - Actual execution using Grok LLM
7. **Run History** - Track all executions with summaries

### Devin's Capabilities
- Shell command execution
- File system read/write
- Project exploration
- Code analysis
- System administration tasks
- Self-modification (with approval)

## Database Collections
- `devin_tasks` - Task queue
- `devin_runs` - Execution history
- `agents` - Agent configurations (includes Devin)

## Environment Variables
- `EXPO_PUBLIC_ADMIN_SECRET` - Admin password
- `GROK_API_KEY` - Grok LLM API key
- `MONGO_URL` - MongoDB connection

## Completed (March 5, 2026)
- [x] Stripped 20+ frontend pages down to single Devin Lab page
- [x] Simplified auth to admin-only password gate
- [x] Removed AuthContext and complex auth flows
- [x] Cleaned up layout to single route
- [x] Added delete task endpoint
- [x] Tested all core functionality (create, queue, approve, run, history)

## Next Steps (P0)
1. **Execution Quality Scoring** - Rate Devin's task completion quality
2. **Auto-Retry Heuristics** - Automatically retry failed tasks with adjustments
3. **Dry Run Preview** - Show expected actions before execution

## Future Enhancements (P1/P2)
- Task templates for common operations
- Scheduled/recurring tasks
- Real-time execution logs streaming
- Task chaining (dependent tasks)
- Export run history to markdown

## Credentials
- **Admin Password**: `forge_master_2025`
