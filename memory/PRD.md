# PAUL·E — Product Requirements Document

## Original Problem Statement
Build a monetizable, customizable AI agent platform named "PAUL·E". Core idea: a "Pack System" where users can purchase specialized agent packs (Coder, Researcher, Companion, etc.) to tailor the agent's personality and skills.

## User Personas
- **Solo developer / power user**: Wants a capable coding assistant with execution rights
- **Casual user**: Wants a friendly companion, platonic or intimate
- **Researcher / productivity user**: Needs browsing + synthesis capabilities
- **New user (trial)**: Discovers value through the Coder Pro free trial (20 action prompts)

## Core Architecture
```
/app
├── backend/
│   ├── server.py           # Monolithic FastAPI server (all routes, agent logic, pack system)
│   └── requirements.txt
└── frontend/
    ├── app/index.tsx       # Monolithic React Native (Expo) app — all tabs including Packs
    └── .env
```

## Tech Stack
- **Frontend**: React Native (Expo), TypeScript
- **Backend**: FastAPI + MongoDB (Motor)
- **LLM**: Grok (xAI) — less-restricted, key for Companion pack
- **Browser automation**: Playwright (Researcher + Task Master packs)

## What's Been Implemented

### Session 1 (March 2026) — Pack System MVP
- PAUL·E rebrand (from "Devin")
- 4 initial packs seeded (Coder, Companion, Researcher, Task Master)
- Backend pack-aware: `/api/agentic-chat` uses active pack's system_prompt + allowed_tools
- Packs tab in frontend: view packs, switch active pack
- Header shows active pack name

### Session 2 (March 2026) — Revised Pack Structure + Trial System
- **7 packs** (upsert by slug, always current):
  | Pack | Price | Tools | Notes |
  |------|-------|-------|-------|
  | Coder | FREE | read-only (open_file, find_*) | Baseline fallback |
  | Friend | $2.99 | save_memory, recall_memories | Platonic companion |
  | Companion | $4.99 | save_memory, recall_memories | **Age-gated (18+)** |
  | Coder Pro | $4.99 | shell + full file I/O | Trial: 20 action prompts free |
  | Researcher | $4.99 | all browser tools | |
  | Task Master | $7.99 | everything + create_task | |
  | Innovator | $9.99 | — | **Coming Soon** |
- **Coder Pro Free Trial**: New users start on Coder Pro (is_trial=True, max 20 action prompts). Smart cap: only counts prompts that trigger tool execution. On expiry, auto-downgraded to Coder.
- **Age-gate**: Companion requires age verification modal (18+ confirm) before first activation
- **Coming Soon**: Innovator is disabled/dimmed in UI, activation returns 403
- **Trial banner**: Shows in Chat tab when user is on trial (e.g. "15/20 builds remaining")
- **Trial tracking**: `trial_info` returned in every agentic-chat response

## Key API Endpoints
- `GET /api/packs` — All available packs
- `GET /api/user/packs` — User's packs with is_active, is_unlocked
- `GET /api/user/active-pack` — Active pack details
- `GET /api/user/trial-status` — Trial state for current user
- `POST /api/user/packs/{id}/activate` — Activate pack (checks age_gate, coming_soon)
- `POST /api/user/packs/{id}/unlock` — Unlock pack (pre-payment integration)
- `POST /api/user/packs/{id}/age-verify` — Confirm 18+ age gate
- `POST /api/agentic-chat` — Chat with PAUL·E (trial-aware, tool-aware)

## Key DB Schema
- **packs**: `{slug, name, tagline, icon, color, system_prompt, allowed_tools, is_free, price_usd, age_gate, coming_soon, sort_order}`
- **user_packs**: `{user_id, pack_id, is_unlocked, is_active, is_trial, trial_actions_used, trial_max_actions, age_verified}`
- **agent_memories**: `{agent_id, content, type, timestamp}`
- **devin_tasks**: tasks collection (name is legacy)
- **agentic_conversations**: chat history with pack_id context

## Admin Credentials
- Password: `forge_master_2025`

### Session 3 (March 2026) — Devin Erasure + Settings + Customize
- **"Devin" fully removed**: Typing indicator now shows "PAUL·E", agent name check updated, conversation style prompt renamed
- **Default pack fixed**: `ensure_sensible_default_packs()` migration auto-corrects any user stuck on Companion without age verification → switches to Coder Pro/Coder at startup
- **Companion buried properly**: Hidden from Packs grid unless globally age-verified. No 18+ badge.
- **Settings tab**: Instance + Active Pack info, "Advanced Settings" collapsible section with age verification ("Enable mature content — unlocks a new pack")
- **Customize tab**: Name / Personality (balanced|professional|casual|witty) / Tone (warm|neutral|direct|playful) / Response Length — locked for free Coder users, available on trial or paid
- **Customization in agentic_chat**: User's name/personality/tone/length preferences are prepended to the system prompt for paid/trial users
- **New endpoints**: `GET/POST /api/user/settings`, `GET/PUT /api/user/customization`, `POST /api/user/settings/age-verify`
- [ ] Stripe integration for pack purchases
- [ ] User authentication (JWT / Google OAuth) — currently single admin user
- [ ] Deployment fix (recurring issue)

## P1 Backlog
- [ ] Innovator Pack full implementation (7-stage Novelty Engine)
  - Prior art search (requires browser tools — MANDATORY)
  - Adversarial scoring (score AFTER arguing against idea)
  - Enforced: 2-3 ideation methods max, selected and exhausted
- [ ] PAUL·E Pro Subscription (cross-pack memory, higher limits, early pack access)
- [ ] Usage caps for free Coder tier (N msgs/day, "watch ad for credits" button)

## P2 / Future Backlog
- [ ] Creator Pack (image/video generation — Gemini Nano Banana / GPT-image-1)
- [ ] Referral system (credits for referrals)
- [ ] Voice control (TTS/STT as premium feature)
- [ ] Calendar access, notifications
- [ ] Rewarded ads framework (watch ad → +N trial credits)
- [ ] Pack-specific memory (agent_memories with pack_id)
- [ ] Rename devin_tasks → paule_tasks

## Innovator Pack Design Notes
Blueprint provided by user (novelty-engine-v2-SKILL.pdf):
- 7-stage pipeline: Domain framing → Prior art → Absence diagnostic → Ideation → Scoring → Failure analysis → Validation roadmap
- Key insight: Prior art BEFORE ideation (not after)
- Absence diagnostic: maps gaps to 6 archetypes (Discovery Gap, Coordination Problem, etc.)
- Scoring: (Novelty × Feasibility × Impact) / 100
- Temporal novelty (half-life) — novelty is time-bound
- Implementation requirement: web search tools MANDATORY, adversarial scoring BEFORE final score
- Price: $9.99

## Known Issues
- Deployment: recurring failure — investigate after next major feature set
- User auth: single admin user only — need proper auth before public launch
