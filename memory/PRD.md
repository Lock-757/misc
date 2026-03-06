# PAUL·E - Product Requirements Document

## Product Name
**PAUL·E** (stylized as PAUL·E or Paul-E)
- Triple meaning: Poly (multiple modes) + DALL·E (AI convention) + Human name (approachable)

## Original Problem Statement
Build a visually appealing, monetizable mobile agent platform where users can:
- Choose and activate specialized "packs" for the agent
- Each pack tailors the agent's personality, skills, and tool access
- Monetize through one-time pack purchases

## Product Direction
**Core Concept**: Customizable agent platform with monetizable "Packs"

## Pack System (COMPLETED - March 2026)

### Available Packs
| Pack | Price | Tools | Color |
|------|-------|-------|-------|
| Coder | FREE | shell, file ops, browser | Green |
| Companion | $4.99 | save_memory, recall_memories | Pink |
| Researcher | $4.99 | All browser tools | Blue |
| Task Master | $4.99 | shell, files, create_task | Purple |

### Implementation Details
- **Backend**: `/api/packs`, `/api/user/packs`, `/api/user/active-pack`, pack activation/unlock
- **Frontend**: Packs tab with grid UI, header shows active pack name + icon + color
- **Memory**: Pack-specific memory (memories associated with `pack_id`)
- **Tools**: Tool permissions filtered by pack's `allowed_tools`

## Architecture

### Frontend (Expo/React Native)
```
/app/frontend/app/index.tsx
├── Chat Tab (default)
├── Packs Tab 
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

### PAUL·E Rebrand (March 6, 2026)
- [x] Backend system prompts updated to PAUL·E
- [x] Frontend UI text updated (header, chat, placeholders)
- [x] Agent name in DB updated

### Pack System MVP (March 5, 2026)
- [x] 4 default packs seeded
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
- **Backend**: 96% (23/24 tests)
- **Frontend**: 100% verified
- Test reports: `/app/test_reports/iteration_8.json`

## Credentials
- **Admin Password**: `forge_master_2025`
- **Header**: `X-Admin-Key: forge_master_2025`

## Recommended Next Steps

### P0 - Monetization (Revenue)
1. **Stripe Integration** - Add payment processing for pack purchases
   - Checkout flow for locked packs
   - Webhook to unlock packs on payment success
   - Already have placeholder in `/api/user/packs/{id}/unlock`

### P1 - User Experience
2. **Voice Control** - High user interest
   - Push-to-talk button in chat
   - Speech-to-text (input)
   - Text-to-speech (PAUL·E responses)
   - ElevenLabs or OpenAI TTS integration

3. **Pack-Specific Memory** - Currently partially implemented
   - Memories already have `pack_id` field
   - Need to filter memory retrieval by active pack
   - Foundation for premium "Shared Context"

### P2 - Platform Features
4. **User Authentication** - Currently admin-only
   - User registration/login
   - Multiple users with own pack ownership
   - Google OAuth option

5. **Device Control** 
   - Notifications (alert user when task completes)
   - Calendar integration
   - Camera access (for Researcher pack)

### Future/Backlog
- Premium "Shared Context" (cross-pack memory subscription)
- Custom pack creation by users
- Dark/Light mode toggle
- Deployment verification
- Visual task chaining UI

## Known Issues
- **Deployment**: Previously failing, needs verification
- **User Trust**: Platform-level concern (acknowledged)

## Technical Notes
- Using Grok API for LLM functions
- Playwright for browser automation
- MongoDB for all data storage
- Hot reload enabled for development
