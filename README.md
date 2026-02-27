# Resilient Live Polling System

Full-stack implementation with:
- Frontend: React + TypeScript + Hooks
- Backend: Node.js + Express + Socket.io + TypeScript
- DB: MongoDB (persistence for polls and votes)

## Project Structure

- `server/` - API + Socket.io + DB persistence
- `client/` - Teacher/Student UI

## Setup

### 1) Backend

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

Backend runs at `http://localhost:4000`.

### 2) Frontend

```bash
cd client
npm install
cp .env.example .env
npm run dev
```

Frontend runs at `http://localhost:5173`.

## Features Implemented

### Teacher
- Create poll (question, options, 5-60 second timer)
- Live result updates
- Poll history from DB
- New poll blocked while one poll is active

### Student
- Per-tab session onboarding with name
- Receive active question instantly
- Server-synced timer (late joiners see remaining time)
- One vote per poll guaranteed by DB unique index and service checks
- Live results after submission and on completion

### Resilience
- Refresh recovery via `/api/polls/state` and `poll:state`
- Server remains source of truth for poll status, timer, and vote totals
- Poll and vote persistence in MongoDB

## Deployment Notes

Host backend and frontend separately (Render/Railway/Vercel etc.), then:
- Backend (`server/.env`)
	- `MONGO_URI=<your mongodb connection string>`
	- `CLIENT_ORIGIN=<your deployed frontend URL>`
- Frontend (`client/.env`)
	- `VITE_API_BASE=<your deployed backend URL>/api`
	- `VITE_SOCKET_URL=<your deployed backend URL>`
