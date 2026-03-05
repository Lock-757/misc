# Agent Platform - Product Requirements Document

## Original Problem Statement
Build a visually appealing, monetizable mobile agent platform where users can:
- Choose and activate specialized "packs" for the agent
- Each pack tailors the agent's personality, skills, and tool access
- Monetize through one-time pack purchases

## Product Direction
**Core Concept**: Customizable agent platform with monetizable "Packs"

## Pack System (COMPLETED - March 2026)

### Available Packs
| Pack | Price | Tools |
|------|-------|-------|
| Coder | FREE | shell, file ops, browser |
| Companion | $4.99 | save_memory, recall_memories |
| Researcher | $4.99 | All browser tools |
| Task Master | $4.99 | shell, files, create_task |

### Implementation Details
- **Backend**: `/api/packs`, `/api/user/packs`, `/api/user/active-pack`, pack activation/unlock
- **Frontend**: Packs tab with grid UI, header shows active pack, pack switching clears chat
- **Memory**: Pack-specific memory (memories associated with `pack_id`)
- **Tools**: Tool permissions filtered by pack's `allowed_tools`

## Architecture

### Frontend (Expo/React Native)
```
/app/frontend/app/index.tsx
├── Chat Tab (default)
├── Packs Tab (NEW)
├── Task Tab
├── Queue Tab
├── History Tab
├── Memory Tab
└── Perms Tab
```

### Backend (FastAPI)
```
/app/backend/server.py
├── Pack System endpoints (lines 1633-1880)
├── Agentic chat (pack-aware)
├── Tool execution (pack-filtered)
├── Memory system (pack-aware)
```

### Database Collections
- `packs` - Pack definitions
- `user_packs` - User ownership and activation
- `agent_memories` - Now includes `pack_id` field

## Completed Features

### Pack System MVP (March 5, 2026)
- [x] 4 default packs seeded (Coder, Companion, Researcher, Task Master)
- [x] Pack CRUD APIs
- [x] User pack ownership tracking
- [x] Pack activation/switching
- [x] Tool permissions per pack
- [x] Header shows active pack
- [x] Packs tab UI with grid
- [x] Chat clears on pack switch

### Previous Completions
- [x] Chat interface with tool execution
- [x] Task workflow with chaining
- [x] Quality scoring & auto-retry
- [x] Browser automation tools
- [x] Permission system (backend enforced)
- [x] Session-based chat continuity

## Testing Status
- **Backend**: 96% (23/24 tests) - `/app/backend/tests/test_pack_system.py`
- **Frontend**: 100% (all features working)
- Test reports: `/app/test_reports/iteration_8.json`

## Credentials
- **Admin Password**: `forge_master_2025`
- **Header**: `X-Admin-Key: forge_master_2025`

## Next Steps (P1)

### Multi-Layered Memory Architecture
- Associate memories with `pack_id`
- Pack-local memory retrieval
- Foundation for premium "Shared Context"

### Stripe Integration
- Payment processing for pack purchases
- Webhook for unlocking packs

### Voice Control (Phase 1)
- Push-to-talk button
- Speech-to-text integration
- Text-to-speech responses

## Future/Backlog (P2)
- Premium "Shared Context" feature
- Device Control (Notifications, Calendar)
- Dark/Light mode support
- Visual task chaining UI
- Deployment verification

## Known Issues
- **Deployment**: Previously failing, needs verification after Pack System
- **User Trust**: Platform-level concern (acknowledged)

## Technical Notes
- Using Grok API for LLM functions
- Playwright for browser automation
- MongoDB for all data storage
- Hot reload enabled for development
