# Aurora AI (Agent Forge) - Product Requirements

## Original Problem Statement
Build a visually appealing, functional mobile/web AI app called "Agent Forge" (rebranded "Aurora"). Core: a chat interface for an intelligent AI agent with tool generation capability.

## Target Audience
- Primary user: The owner/creator (admin) who controls all settings
- Secondary: Registered users who interact with the AI agent

## Core Requirements
- **Chat Interface**: Intelligent agent chat with streaming responses
- **LLM**: Gemini 2.5 Flash (via Emergent integrations) for chat; Grok kept for image generation
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

### Session 5 (2026-03-03) — Agent Dashboard Enhancement
- **Agent Profile Tabs**: Added Activity, Goals, and Reputation tabs to agent detail view
- **Data Display**: Dashboard now fetches and displays Journal entries, Goals (with progress bars), Reputation scores, and Specializations for each agent
- **Backend endpoints verified**: `/api/agents/{id}/journal`, `/api/agents/{id}/goals`, `/api/agents/{id}/reputation`, `/api/agents/{id}/specializations`

### Session 6 (2026-03-04) — Grok Video Fix + Chat Keyboard Stability
- **Grok video generation fixed**: Hardened `/api/generate-video` polling/parser logic in `backend/server.py` to support multiple provider response structures (including `status: done` + `video` URL string/object) and prevent "No video data in response" regression.
- **Mobile keyboard spacing improvements**:
  - Main chat (`frontend/app/index.tsx`): safe-area aware bottom spacing and keyboard offset tuning for input/send row.
  - Agent chat (`frontend/app/agentchat.tsx`): added `KeyboardAvoidingView` + safe-area aware input row spacing.
- **Testability improvements**: Added/expanded `data-testid` coverage on key chat controls touched in this fix batch.
- **Verification**:
  - Manual curl confirmed `/api/generate-video` returns `200` with non-empty `video_base64`.
  - Testing agent report `iteration_4.json` passed targeted backend/frontend regressions (video, grid menu, mobile input visibility).

### Session 7 (2026-03-04) — Session Recovery + Grid/Menu Stability + Devin Visibility
- **Session recovery hardening**:
  - Added `resetSession()` flow in `frontend/context/AuthContext.tsx` to clear stale admin/session state.
  - Added login screen `Reset Session` action in `frontend/app/login.tsx`.
  - Replaced blank unauthenticated state in `frontend/app/index.tsx` with a recovery UI (Go to Login / Reset Session).
- **Logout discoverability & reliability**:
  - Added explicit logout affordances and web-safe logout behavior in `frontend/app/index.tsx`.
  - Header left control now performs immediate logout on web (no hidden alert dependency).
  - Added persistent quick logout action in grid menu.
- **Grid/menu reliability**:
  - Modal overlay updated to explicit `Pressable` backdrop close behavior.
  - Grid menu open/close behavior revalidated on web.
- **Devin visibility & agent consistency**:
  - Added backend `ensure_core_agents()` safeguard in `backend/server.py` called from `GET /api/agents` to ensure Aurora + Devin exist.
  - Extended `AgentConfig`/create/update models with `has_tools` support.
  - Agent list UI (`frontend/app/agents.tsx`) now prioritizes Devin/Devon at top and confirms tool-agent label.
- **Verification**:
  - Web smoke checks: login works, grid menu opens (`Features` visible), direct `/agents` shows `Devin`.
  - Top-left logout action returns user to `/login` after Expo service refresh.

### Session 4 (2026-03-02) — HD Video Generation & Cognitive Tools System
- **HD Video Generation**: Implemented Sora 2 video generation via Emergent LLM Key
  - Backend: New endpoints `/api/generate-video`, `/api/generated-videos`, `/api/delete-generated-video`
  - Frontend: New screen `/videogen` with options for resolution (HD 1280x720, Wide 1792x1024, Portrait 1024x1792, Square 1024x1024), duration (4s, 8s, 12s), and model (Sora 2, Sora 2 Pro)
  - Videos stored in MongoDB `generated_videos` collection with user isolation
  - Video preview with web HTML5 video player, download support
  - Progress indicator during generation (2-5 minutes typical)
- **Cognitive Tools System**: Aurora can now generate and use internal cognitive tools
  - 5 Built-in tools: NOVELTY_CHECK, CHANGE_DETECT, META_REASON, CONTEXT_EXPAND, CONFIDENCE_CHECK
  - User-defined tools persist in MongoDB `cognitive_tools` collection
  - Aurora uses tools in responses to enhance reasoning
  - New endpoint: `/api/cognitive-tools` to view all available tools
- **Menu Update**: Added "HD Videos" button in Creative & Tools section of main menu
- **Grid Menu Fix**: Fixed TouchableOpacity event propagation issue
- **All Previous Features Verified**: Testing agent confirmed 100% backend pass rate (34/34 tests)

### Session 3 (2026-03-02) — Admin Page, Privacy, Features Batch
- **Admin Console page** (`/admin`): User list with chat/image/download counts, per-user conversation viewer, download logs, platform stats. Admin-only access enforced by `X-Admin-Key` header
- **Admin Console button** in index.tsx menu: Only visible when `isAdmin === true`, navigates to `/admin`
- **Logout button**: Present in main menu, navigates to `/login`
- **Admin auto-logout**: AppState listener in `index.tsx` — admin is logged out when app goes to background/inactive
- **Session adult_mode toggle**: Type "adult_mode" in chat to enable for current session only (no API call, no storage)
- **Login fix**: Auth-state-driven navigation via `useEffect` watching `isAuthenticated` — fixed modal race condition
- **Download tracking**: `POST /api/track-download` logs silently per download; accessible in admin console Downloads tab
- **Image download button**: Green download icon in preview modal + gallery thumbnail overlay. Web: triggers browser download; native: saves to media library
- **Image styles fixed**: Style presets PREPENDED to prompt (stronger influence). Added Cinematic, Photo, Oil Paint, Cyberpunk, Minimal presets
- **AgentConfig fix**: `system_prompt` now defaults properly when null/None on agent create
- **User data isolation (session 2 fix extended)**: Chat endpoint uses session `user_id`, not body `user_id`
- **P0 Production Fix**: Changed `app.json` `web.output` from `"static"` to `"single"` (SPA mode) + removed `newArchEnabled:true` to fix blank white screen on deployment
- **P1 Session Persistence**: Refactored `AuthContext.tsx` `initialize()` to run admin check first, then token check sequentially (no race condition). Only removes token on HTTP 401, not on network errors
- **P2 Feature Menu Grid**: Fixed `menuGrid` styles — replaced `gap:16` + `width:22%` with reliable `width:25%` + `paddingHorizontal:4` for proper 4-column grid layout
- **P3 18+ Badge**: Fixed badge condition to `agent.adult_mode === true && !isAdmin` (strict equality). Reset Aurora agent in MongoDB from `adult_mode:true` to `adult_mode:false`
- **Critical Hooks Fix** (found by testing agent): Moved helper functions before conditional early returns in `index.tsx` to fix React "Rendered more hooks than during previous render" crash on page refresh
- **JSX Syntax Fix** (found by testing agent): Fixed extra closing brace `')}}` → `')}'` in `index.tsx`

---

## Prioritized Backlog

### P0 — Critical
- [x] HD Video Generation (Sora 2) — COMPLETED Session 4
- [x] Grok video generation regression (`no data returned`) — FIXED Session 6
- [x] Grid menu visibility/clickability regression check — VERIFIED Session 6
- [ ] Verify production deployment shows app correctly after `output:single` change

### P1 — High Priority
- [ ] Keyboard overlap audit for remaining screens beyond main chat + agent chat (if user reports specific screen)
- [ ] Voice-to-text on main chat screen (user request, deferred for cost assessment)
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
