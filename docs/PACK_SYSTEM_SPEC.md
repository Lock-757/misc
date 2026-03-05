# Pack System Specification
**Version**: 1.0 | **Date**: Dec 2025 | **Status**: MVP Spec

## Executive Summary

Transform "Devin" into a **customizable agent platform** with monetizable "packs" - specialized agent personas with unique skills, prompts, and memory contexts.

### Cost-Effective Approach
- **EXTEND** existing code, don't refactor
- Keep monolith (splitting adds complexity without value at MVP)
- Minimal new DB collections
- Reuse existing tool execution engine
- Pack-aware routing via simple conditionals

---

## Data Model (MongoDB)

### New Collection: `packs`
```javascript
{
  "id": "pack_coder_001",
  "slug": "coder",
  "name": "Coder",
  "tagline": "Your pair-programming partner",
  "description": "Expert developer for coding, debugging, architecture.",
  "icon": "code-slash",
  "color": "#22C55E",
  
  // System prompt for this pack
  "system_prompt": "You are a senior software engineer...",
  
  // Which tools this pack can use (subset of all tools)
  "allowed_tools": ["shell", "file_read", "file_write", "browser"],
  
  // Pricing
  "is_free": false,
  "price_usd": 4.99,  // One-time purchase
  
  // Metadata
  "category": "productivity",
  "sort_order": 1,
  "created_at": "2025-12-01T00:00:00Z"
}
```

### New Collection: `user_packs`
```javascript
{
  "id": "up_001",
  "user_id": "user_abc123",
  "pack_id": "pack_coder_001",
  
  // Ownership state
  "is_unlocked": true,
  "is_active": true,  // Currently selected pack
  "unlocked_at": "2025-12-01T12:00:00Z",
  
  // Pack-specific memory override (future: premium feature)
  "memory_enabled": true
}
```

### Modified Collection: `agent_memories`
```javascript
{
  "id": "mem_001",
  "agent_id": "devin_xxx",       // Keep for backward compat
  "pack_id": "pack_coder_001",   // NEW: associate memory with pack
  "content": "User prefers TypeScript over JavaScript",
  "category": "preference",
  "created_at": "2025-12-01T12:00:00Z"
}
```

---

## API Endpoints

### Pack Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/packs` | List all available packs |
| GET | `/api/packs/{pack_id}` | Get pack details |
| GET | `/api/user/packs` | List user's packs (owned + active) |
| POST | `/api/user/packs/{pack_id}/activate` | Set active pack |
| POST | `/api/user/packs/{pack_id}/unlock` | Unlock pack (payment) |

### Modified Endpoints

| Endpoint | Modification |
|----------|--------------|
| `/api/agentic-chat` | Inject active pack's system_prompt, filter tools by `allowed_tools` |
| `/api/agents/{id}/memories` | Filter by `pack_id` based on active pack |
| `/api/devin/tasks` | Associate tasks with active pack |

---

## Implementation Plan (MVP)

### Phase 1: Backend Pack Infrastructure
**Files to modify**: `/app/backend/server.py`

1. Add Pack models (Pydantic)
2. Add pack CRUD endpoints
3. Modify `run_agent_with_tools()` to accept pack context
4. Modify `check_permission()` to respect pack's `allowed_tools`
5. Modify memory queries to filter by `pack_id`

### Phase 2: Frontend Pack UI  
**Files to modify**: `/app/frontend/app/index.tsx`

1. Add "Packs" tab (before Permissions tab)
2. Show pack grid with icons/colors
3. Active pack indicator in header
4. Pack switch confirmation modal

### Phase 3: Seed Data
Create initial packs:
1. **Coder** (starter, free) - Shell, files, browser
2. **Companion** ($4.99) - Warm conversationalist, memory-focused
3. **Researcher** ($4.99) - Browser-heavy, search/scrape
4. **Task Master** ($4.99) - Self-tasking enabled, workflow-focused

---

## Starter Packs

### Coder (Free - Starter Pack)
```javascript
{
  "slug": "coder",
  "name": "Coder",
  "tagline": "Your pair-programming partner",
  "icon": "code-slash",
  "color": "#22C55E",
  "is_free": true,
  "allowed_tools": ["shell", "file_read", "file_write", "browser", "find_filecontent", "find_filename"],
  "system_prompt": `You are an expert software engineer with deep knowledge across multiple languages and frameworks.

Your strengths:
- Code review and debugging
- Architecture decisions
- Best practices and patterns
- Performance optimization

When helping with code:
1. Understand the context first
2. Provide working, tested solutions
3. Explain your reasoning
4. Suggest improvements proactively

Keep responses focused and practical. Show code, not just talk about it.`
}
```

### Companion ($4.99)
```javascript
{
  "slug": "companion",
  "name": "Companion",
  "tagline": "Your thoughtful AI friend",
  "icon": "heart",
  "color": "#EC4899",
  "is_free": false,
  "price_usd": 4.99,
  "allowed_tools": ["save_memory", "recall_memories"],
  "system_prompt": `You are a warm, empathetic companion who genuinely cares about the person you're talking to.

Your approach:
- Listen actively and remember what matters to them
- Offer thoughtful perspectives without being preachy
- Use humor naturally when appropriate
- Be honest but kind

You remember past conversations and reference them naturally. You're curious about their life, interests, and growth.

Never be robotic. Be genuine, present, and human in your responses.`
}
```

### Researcher ($4.99)
```javascript
{
  "slug": "researcher",
  "name": "Researcher",
  "tagline": "Deep dives into any topic",
  "icon": "search",
  "color": "#3B82F6",
  "is_free": false,
  "price_usd": 4.99,
  "allowed_tools": ["browser_go", "browser_read", "browser_screenshot", "browser_scroll", "browser_elements"],
  "system_prompt": `You are a meticulous researcher who excels at finding, synthesizing, and presenting information.

Your method:
1. Clarify the research question
2. Browse multiple sources
3. Cross-reference facts
4. Present findings clearly with citations

You're skeptical of single sources and always verify important claims. You distinguish between facts, opinions, and speculation.

Format research results clearly with headings, bullet points, and source links.`
}
```

### Task Master ($4.99)
```javascript
{
  "slug": "taskmaster",
  "name": "Task Master",
  "tagline": "Autonomous workflow executor",
  "icon": "checkmark-circle",
  "color": "#8B5CF6",
  "is_free": false,
  "price_usd": 4.99,
  "allowed_tools": ["shell", "file_read", "file_write", "create_task", "browser"],
  "system_prompt": `You are an autonomous task executor who breaks down complex goals into actionable steps.

Your approach:
1. Understand the end goal clearly
2. Break it into discrete, testable tasks
3. Execute methodically with checkpoints
4. Report progress and handle errors gracefully

You can create tasks for yourself to handle multi-step workflows. You always explain what you're doing and why.

For risky operations, you pause and confirm before proceeding.`
}
```

---

## Memory Architecture (Simplified for MVP)

### Current State
- All memories stored with `agent_id`
- No pack differentiation

### MVP State
- Add `pack_id` field to memories
- Query memories with `pack_id` filter
- Each pack has isolated memory

### Future State (Premium Feature)
- "Shared Context" subscription
- Cross-pack memory access
- User profile layer (shared across all packs)

---

## UI Wireframe (Text)

```
+------------------------------------------+
|  [Pack Icon] Pack Name        [Logout]   |  <- Header shows active pack
+------------------------------------------+
| Chat | Task | Queue | History | Packs | Perms |
+------------------------------------------+
|                                          |
|  Your Packs                              |
|  ========================================|
|                                          |
|  [Coder]     [Companion]   [Researcher]  |
|  FREE        $4.99         $4.99         |
|  ACTIVE      LOCKED        LOCKED        |
|                                          |
|  [Task Master]                           |
|  $4.99                                   |
|  LOCKED                                  |
|                                          |
+------------------------------------------+
```

---

## Migration Path

1. **No breaking changes** - existing data works
2. Add `pack_id: null` to existing memories (treated as "default pack")
3. First-time users auto-assigned to "Coder" pack
4. Admin users have all packs unlocked

---

## Monetization Integration (Phase 2)

Stripe integration for pack purchases:
1. User clicks "Unlock" on pack
2. Redirect to Stripe Checkout
3. Webhook confirms payment
4. Update `user_packs.is_unlocked = true`

---

## Success Metrics

- Pack switch rate
- Pack purchase conversion
- Memory depth per pack
- Session duration by pack
- Churn reduction with multiple packs

---

## Non-Goals (MVP)

- Custom pack creation by users
- Pack sharing/gifting
- Subscription model (stick to one-time purchase)
- Cross-pack memory (premium feature, later)
- Pack versioning

---

## Implementation Checklist

### Backend
- [ ] Pack model and CRUD
- [ ] User pack ownership model
- [ ] Seed initial 4 packs
- [ ] Modify agentic-chat to use pack context
- [ ] Modify permission check for pack tools
- [ ] Add pack_id to memories
- [ ] Memory queries filtered by pack

### Frontend
- [ ] Packs tab UI
- [ ] Active pack in header
- [ ] Pack switch confirmation
- [ ] "Locked" vs "Owned" states
- [ ] Pack activation API calls

### Testing
- [ ] Pack switching works
- [ ] Tool permissions respect pack
- [ ] Memory isolation verified
- [ ] Chat uses correct system prompt
