const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

// Configure CORS for Express
app.use(cors({
  origin: 'http://localhost:5174',
  methods: ['GET', 'POST'],
  credentials: true
}));

const server = http.createServer(app);

// Configure CORS for Socket.IO
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5174',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const rooms = {};

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('create-room', (userName, cb) => {
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    rooms[roomCode] = { 
      users: [], 
      votes: {},
      hasVoted: new Set(),
      currentQuestion: null,
      timer: null,
      host: socket.id,
      startTime: null
    };
    socket.join(roomCode);
    console.log('Room created:', roomCode);
    if (typeof cb === 'function') {
      cb(roomCode);
    }
  });

  socket.on('join-room', (roomCode, userName, cb) => {
    if (rooms[roomCode]) {
      rooms[roomCode].users.push({ id: socket.id, name: userName });
      socket.join(roomCode);
      console.log('User joined room:', roomCode);
      io.to(roomCode).emit('user-joined', rooms[roomCode].users.filter(u => u.id !== rooms[roomCode].host));
      if (typeof cb === 'function') {
        cb({ success: true });
      }
    } else {
      console.log('Room not found:', roomCode);
      if (typeof cb === 'function') {
        cb({ success: false, error: 'Room not found' });
      }
    }
  });

  socket.on('reconnect-host', (roomCode, userName, cb) => {
    if (rooms[roomCode] && rooms[roomCode].host === socket.id) {
      socket.join(roomCode);
      console.log('Host reconnected to room:', roomCode);
      if (typeof cb === 'function') {
        cb(true);
      }
    } else {
      console.log('Host reconnection failed:', roomCode);
      if (typeof cb === 'function') {
        cb(false);
      }
    }
  });

  socket.on('reconnect-user', (roomCode, userName, cb) => {
    if (rooms[roomCode]) {
      const userIndex = rooms[roomCode].users.findIndex(u => u.name === userName);
      if (userIndex !== -1) {
        rooms[roomCode].users[userIndex].id = socket.id;
        socket.join(roomCode);
        console.log('User reconnected to room:', roomCode);
        if (typeof cb === 'function') {
          cb(true);
        }
      } else {
        console.log('User reconnection failed:', roomCode);
        if (typeof cb === 'function') {
          cb(false);
        }
      }
    } else {
      console.log('Room not found for reconnection:', roomCode);
      if (typeof cb === 'function') {
        cb(false);
      }
    }
  });

  socket.on('leave-room', (roomCode) => {
    if (rooms[roomCode]) {
      if (rooms[roomCode].host === socket.id) {
        // If host leaves, close the room and kick everyone
        io.to(roomCode).emit('room-closed');
        delete rooms[roomCode];
        console.log('Room closed:', roomCode);
      } else {
        // If user leaves, remove them from the room
        rooms[roomCode].users = rooms[roomCode].users.filter(u => u.id !== socket.id);
        io.to(roomCode).emit('user-left', rooms[roomCode].users.filter(u => u.id !== rooms[roomCode].host));
        console.log('User left room:', roomCode);
      }
    }
  });

  socket.on('end-game', (roomCode) => {
    console.log('End game requested for room:', roomCode);
    if (rooms[roomCode] && rooms[roomCode].host === socket.id) {
      io.to(roomCode).emit('room-closed');
      delete rooms[roomCode];
      console.log('Game ended by host:', roomCode);
    }
  });

  socket.on('send-question', ({ roomCode, question }) => {
    if (rooms[roomCode]) {
      // Clear previous timer if exists
      if (rooms[roomCode].timer) {
        clearTimeout(rooms[roomCode].timer);
      }
      
      // Reset votes and hasVoted
      rooms[roomCode].votes = {};
      rooms[roomCode].hasVoted = new Set();
      rooms[roomCode].currentQuestion = question;
      rooms[roomCode].startTime = Date.now();
      
      // Send question to room
      io.to(roomCode).emit('new-question', { 
        question,
        users: rooms[roomCode].users.filter(u => u.id !== rooms[roomCode].host),
        startTime: rooms[roomCode].startTime
      });
      
      // Set 90-second timer
      rooms[roomCode].timer = setTimeout(() => {
        const results = calculateResults(rooms[roomCode].votes);
        io.to(roomCode).emit('question-end', results);
      }, 90000);
      
      console.log('Question sent to room:', roomCode);
    }
  });

  socket.on('vote', ({ roomCode, user, vote }) => {
    if (rooms[roomCode] && !rooms[roomCode].hasVoted.has(user)) {
      rooms[roomCode].votes[user] = vote;
      rooms[roomCode].hasVoted.add(user);
      io.to(roomCode).emit('vote-update', rooms[roomCode].votes);
      console.log('Vote received in room:', roomCode);

      // Check if all users have voted
      const allUsers = rooms[roomCode].users.filter(u => u.id !== rooms[roomCode].host);
      if (allUsers.length > 0 && allUsers.every(u => rooms[roomCode].hasVoted.has(u.name))) {
        // Clear the timer and show results immediately
        if (rooms[roomCode].timer) {
          clearTimeout(rooms[roomCode].timer);
        }
        const results = calculateResults(rooms[roomCode].votes);
        io.to(roomCode).emit('question-end', results);
        console.log('All votes received, showing results:', results);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    // Remove user from all rooms they were in
    Object.entries(rooms).forEach(([roomCode, room]) => {
      if (room.host === socket.id) {
        // If host disconnects, close the room and kick everyone
        io.to(roomCode).emit('room-closed');
        delete rooms[roomCode];
        console.log('Room closed due to host disconnect:', roomCode);
      } else {
        const userIndex = room.users.findIndex(u => u.id === socket.id);
        if (userIndex !== -1) {
          room.users.splice(userIndex, 1);
          io.to(roomCode).emit('user-left', room.users.filter(u => u.id !== room.host));
          console.log('User disconnected from room:', roomCode);
        }
      }
    });
  });
});

function calculateResults(votes) {
  const voteCount = {};
  Object.values(votes).forEach(vote => {
    voteCount[vote] = (voteCount[vote] || 0) + 1;
  });
  
  return Object.entries(voteCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([name, count]) => ({ name, count }));
}

app.get('/', (req, res) => {
  res.send('foundies backend running');
});

server.listen(5000, () => {
  console.log('Backend listening on http://localhost:5000');
}); 