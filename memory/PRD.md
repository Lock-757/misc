# Aurora AI (Agent Forge) - Product Requirements

## Original Problem Statement
Build a visually appealing, functional mobile/web AI app called "Agent Forge" (rebranded "Aurora"). Core: a chat interface for an intelligent AI agent with tool generation capability.

## Target Audience
- Primary user: The owner/creator (admin) who controls all settings
- Secondary: Registered users who interact with the AI agent

## Core Requirements
- **Chat Interface**: Intelligent agent chat with streaming responses
- **LLM**: Grok as primary (Claude, Kimi as future integrations)
- **Auth**: Email/password + Google OAuth, JWT sessions, user-specific data isolation
- **Admin Role**: Master password bypass (`forge_master_2025`), no content filters, no "18+" badge
- **Image Generation**: HD images via Grok (`grok-imagine-image`)
- **Image Editing**: AI prompt-based image editing
- **Conversation History**: View, resume, delete past conversations
- **Content Filter**: Hidden in Settings > Advanced; admin bypasses entirely
- **Dynamic Suggestions**: Rotating prompt suggestions on main screen
- **3D Animated UI**: "Aurora" high-tech aesthetic with animated orbs and backgrounds

## Architecture
```
/app
├── backend/
│   ├── server.py         # FastAPI: Auth, Chat, Image Gen, Agents, History
│   ├── .env              # MONGO_URL, DB_NAME, GROK_API_KEY
│   └── requirements.txt
└── frontend/
    ├── app/
    │   ├── context/AuthContext.tsx (at /app/frontend/context/AuthContext.tsx)
    │   ├── components/AnimatedBackground.tsx
    │   ├── _layout.tsx, index.tsx, login.tsx, auth-callback.tsx
    │   ├── history.tsx, imagegen.tsx, image-editor.tsx
    │   ├── settings.tsx, agents.tsx, stats.tsx, tools.tsx
    │   └── (15+ feature screens)
    ├── app.json           # web.output="single", no newArchEnabled
    ├── .env               # EXPO_PUBLIC_BACKEND_URL
    └── package.json
```

## Tech Stack
- **Frontend**: Expo 54, React Native 0.81.5, Expo Router, TypeScript, Axios
- **Backend**: Python, FastAPI, Motor (async MongoDB), Pydantic
- **Database**: MongoDB (`test_database`)
- **Auth**: JWT sessions stored in MongoDB `user_sessions` collection
- **Token Storage**: `expo-secure-store` (native) / `localStorage` (web)
- **API**: Grok API for chat + image generation

## Key DB Schema
- `users`: `{user_id, email, name, hashed_password, google_id}`
- `conversations`: `{id, user_id, agent_id, messages[], created_at}`
- `agents`: `{id, name, avatar, system_prompt, model, adult_mode}`
- `user_sessions`: `{session_token, user_id, expires_at}`

## Admin Credentials
- Password: `forge_master_2025` (any email + this password bypasses normal auth)
- Stored as `forge_admin: "true"` in SecureStore/localStorage

## Key API Endpoints
- `POST /api/auth/register` — Register user, returns `session_token`
- `POST /api/auth/login` — Login, returns `session_token`
- `GET /api/auth/me` — Validate session (token via cookie or `Authorization: Bearer`)
- `POST /api/auth/logout` — Invalidate session
- `POST /api/auth/google/session` — Google OAuth callback
- `GET/POST /api/agents` — List/create agents
- `POST /api/chat` — Send message, requires `user_id`
- `GET /api/conversations` — User conversations (filtered by `user_id`)
- `POST /api/generate-image` — HD image via Grok, `is_admin` flag bypasses filters

---

## What's Been Implemented

### Session 1 (Previous)
- Full User Auth (email/password + Google OAuth)
- Admin Role + master password bypass
- 3D animated "Aurora" main screen redesign
- Image Generation (Grok `grok-imagine-image` model)
- Conversation History with resume functionality
- User-specific data isolation
- Image Editor with keyboard handling
- Dynamic rotating prompt suggestions
- Content Filter hidden in Settings > Advanced

### Session 2 (2026-03-02) — Bug Fix Batch
- **P0 Production Fix**: Changed `app.json` `web.output` from `"static"` to `"single"` (SPA mode) + removed `newArchEnabled:true` to fix blank white screen on deployment
- **P1 Session Persistence**: Refactored `AuthContext.tsx` `initialize()` to run admin check first, then token check sequentially (no race condition). Only removes token on HTTP 401, not on network errors
- **P2 Feature Menu Grid**: Fixed `menuGrid` styles — replaced `gap:16` + `width:22%` with reliable `width:25%` + `paddingHorizontal:4` for proper 4-column grid layout
- **P3 18+ Badge**: Fixed badge condition to `agent.adult_mode === true && !isAdmin` (strict equality). Reset Aurora agent in MongoDB from `adult_mode:true` to `adult_mode:false`
- **Critical Hooks Fix** (found by testing agent): Moved helper functions before conditional early returns in `index.tsx` to fix React "Rendered more hooks than during previous render" crash on page refresh
- **JSX Syntax Fix** (found by testing agent): Fixed extra closing brace `')}}` → `')}'` in `index.tsx`

---

## Prioritized Backlog

### P0 — Critical
- [ ] Voice-to-text on main chat screen (user request, deferred)
- [ ] Verify production deployment shows app correctly after `output:single` change

### P1 — High Priority
- [ ] Integrate Claude API (placeholder exists)
- [ ] Integrate Kimi LLM API (placeholder exists)
- [ ] Agents should be user-scoped (currently global — all users share same agents)

### P2 — Medium Priority
- [ ] Further enhance 3D/high-tech UI (user request)
- [ ] RAG (Retrieval Augmented Generation) support
- [ ] File uploads for documents

### P3 — Low Priority / Future
- [ ] Multi-agent system
- [ ] Biometric lock screen
- [ ] Refresh tokens for more robust session management
- [ ] Move admin password from hardcoded `AuthContext.tsx` to secure env variable
- [ ] Scheduled tasks feature (screen exists but is placeholder)
- [ ] Export conversations feature

## Known Limitations
- Admin password is hardcoded in `AuthContext.tsx` (security risk — move to env var)
- Agents are global (not user-scoped) — all users share the same agents list
- Voice recording on web is limited by browser permissions/APIs
- Google OAuth only implemented for web, not native
