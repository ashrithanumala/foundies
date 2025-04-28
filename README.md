# foundies

A Kahoot-like real-time voting game for live audiences.

## Getting Started

### Backend

```bash
cd backend
npm install
npm start
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

- The backend runs on port 5000 by default.
- The frontend runs on port 5173 by default.
- Make sure both are running for full functionality.

## Features

- Host creates a game room and displays a join code/QR.
- Audience joins via QR or URL.
- Host controls questions, audience votes in real-time.
- Results are shown live.

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express + Socket.IO 