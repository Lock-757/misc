# PAUL·E — Product Requirements Document

## Original Problem Statement
Build a monetizable, customizable AI agent platform named "PAUL·E". Core idea: a "Pack System" where users can purchase specialized agent packs (Coder, Researcher, Companion, etc.) to tailor the agent's personality and skills.

## User Personas
- **Beta / guest user**: Tries the platform without signing up — gets Coder Pro trial (20 action prompts)
- **Solo developer / power user**: Wants a capable coding assistant with execution rights
- **Casual user**: Wants a friendly companion, platonic or intimate
- **Researcher / productivity user**: Needs browsing + synthesis capabilities

## Core Architecture
```
/app
├── backend/
│   ├── server.py           # Monolithic FastAPI server (all routes, agent logic, pack system)
│   └── requirements.txt
└── frontend/
    ├── app/index.tsx       # Monolithic React Native (Expo) app — all tabs
    └── .env
```

## Tech Stack
- **Frontend**: React Native (Expo), TypeScript
- **Backend**: FastAPI + MongoDB (Motor)
- **LLM**: Grok (xAI) — less-restricted, key for Companion pack
- **Browser automation**: Playwright (Researcher + Task Master packs)

## What's Been Implemented

### Session 1 — Pack System MVP
- PAUL·E rebrand (from "Devin")
- 4 initial packs seeded, backend pack-aware
- Packs tab in frontend

### Session 2 — Revised Pack Structure + Trial System
- **7 packs** (upsert by slug):
  | Pack | Price | Tools | Notes |
  |------|-------|-------|-------|
  | Coder | FREE | read-only (open_file, find_*) | Baseline fallback |
  | Friend | $2.99 | save_memory, recall_memories | Platonic companion |
  | Companion | $4.99 | save_memory, recall_memories | Age-gated (buried) |
  | Coder Pro | $4.99 | shell + full file I/O | Trial: 20 action prompts free |
  | Researcher | $4.99 | all browser tools | |
  | Task Master | $7.99 | everything + create_task | |
  | Innovator | $9.99 | — | Coming Soon |
- Coder Pro Free Trial (smart cap — tool-triggered prompts only)
- Age-gate on Companion (hidden unless verified via Settings > Advanced)
- Trial banner in chat, trial_info in agentic-chat response

### Session 3 — Polish
- "Devin" fully erased from UI and system prompts
- `ensure_sensible_default_packs()` migration — no user stuck on Companion
- Settings tab (profile + Advanced Settings with age verification)
- Customize tab (name/personality/tone/length — locked for free Coder)
- Customization applied to system prompt for paid/trial users
- New endpoints: /api/user/settings, /api/user/customization, /api/user/settings/age-verify

### Session 4 — Beta / No-Login Access
- "Try Beta — no account needed" button on login screen
- Guest UUID persisted in localStorage (`paule_guest_id`)
- `X-Guest-Id` header supported by all backend endpoints
- Guest auto-gets Coder Pro trial (20 action prompts)
- "BETA" badge in header for guest users
- Age verification (mature content) hidden for guests — prevents API credit drain

## Key API Endpoints
- `GET /api/packs` — All available packs
- `GET /api/user/packs` — User's packs
- `GET /api/user/active-pack` — Active pack
- `GET /api/user/trial-status` — Trial state
- `POST /api/user/packs/{id}/activate` — Activate (checks age_gate, coming_soon)
- `POST /api/user/packs/{id}/unlock` — Unlock
- `POST /api/user/packs/{id}/age-verify` — Per-pack age gate
- `GET/POST /api/user/settings` — Global settings (age_verified)
- `POST /api/user/settings/age-verify` — Global age verification (hidden for guests)
- `GET/PUT /api/user/customization` — Name/personality/tone/length
- `POST /api/agentic-chat` — Chat (trial-aware, customization-aware)

## Key DB Schema
- **packs**: `{slug, name, tagline, icon, color, system_prompt, allowed_tools, is_free, price_usd, age_gate, coming_soon, sort_order}`
- **user_packs**: `{user_id, pack_id, is_unlocked, is_active, is_trial, trial_actions_used, trial_max_actions, age_verified}`
- **user_settings**: `{user_id, age_verified}`
- **user_customizations**: `{user_id, agent_name, personality, tone, response_length}`
- **agentic_conversations**: chat history with pack_id context

## Auth
- Admin: password `forge_master_2025` → `X-Admin-Key` header
- Guest: UUID stored in localStorage → `X-Guest-Id` header
- Guest user_id pattern: `guest_<uuid>`

## P0 Backlog
- [ ] Stripe integration for pack purchases
- [ ] Proper user authentication (JWT / Google OAuth)
- [ ] Deployment fix (recurring issue)

## P1 Backlog
- [ ] Innovator Pack (7-stage Novelty Engine — blueprint in memory)
  - Prior art search (browser tools MANDATORY)
  - Adversarial scoring before final score
  - Max 2-3 ideation methods, exhausted
- [ ] PAUL·E Pro Subscription (cross-pack memory, higher limits)
- [ ] Usage caps for free Coder tier

## P2 / Future
- [ ] Creator Pack (image/video gen)
- [ ] Referral system
- [ ] Voice control (TTS/STT)
- [ ] Rewarded ads framework
- [ ] Pack-specific memory
- [ ] Companion: soft upsell when age-verify done in Settings

## Innovator Pack Notes
Blueprint: novelty-engine-v2-SKILL.pdf
- 7 stages: Domain → Prior art → Absence diagnostic → Ideation → Scoring → Failure analysis → Validation
- Scoring: (Novelty × Feasibility × Impact) / 100
- Temporal novelty: novelty is time-bound
- Price: $9.99
