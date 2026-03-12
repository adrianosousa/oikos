# OpenClaw Bridge

Routes Oikos companion chat through an OpenClaw agent via its local HTTP API.

## How it works

1. Oikos receives a chat message from the companion (P2P Noise channel)
2. Oikos POSTs `{ message, context }` to this bridge at `:3421/oikos/chat`
3. Bridge injects wallet context as a system message (silent — not shown in UI)
4. Message routes to OpenClaw agent with full memory and session context
5. Reply returns through the same path back to the companion

## Setup

Enable `gateway.http.endpoints.chatCompletions.enabled: true` in OpenClaw config, then:

```env
OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=
OPENCLAW_SESSION_KEY=agent:main:main
```

In Oikos:

```env
BRAIN_TYPE=http
BRAIN_CHAT_URL=http://127.0.0.1:3421/oikos/chat
```

## "Swap the brain"

This bridge is OpenClaw-specific. Any agent that exposes an OpenAI-compatible
`/v1/chat/completions` endpoint works — just point `OPENCLAW_GATEWAY_URL` at it.
