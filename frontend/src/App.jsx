import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000');

function App() {
  const [userName, setUserName] = useState(() => localStorage.getItem('userName') || '');
  const [room, setRoom] = useState(() => localStorage.getItem('room') || '');
  const [joined, setJoined] = useState(() => !!localStorage.getItem('room'));
  const [question, setQuestion] = useState('');
  const [currentQ, setCurrentQ] = useState('');
  const [votes, setVotes] = useState({});
  const [users, setUsers] = useState([]);
  const [isHost, setIsHost] = useState(() => localStorage.getItem('isHost') === 'true');
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [timeLeft, setTimeLeft] = useState(90);
  const [hasVoted, setHasVoted] = useState(false);
  const [results, setResults] = useState(null);
  const [canStartGame, setCanStartGame] = useState(false);
  const [startTime, setStartTime] = useState(null);

  useEffect(() => {
    // Reconnect to room if we have stored data
    if (joined && room) {
      if (isHost) {
        socket.emit('reconnect-host', room, userName, (success) => {
          if (!success) {
            // If reconnection fails, clear storage and reset state
            localStorage.clear();
            setJoined(false);
            setRoom('');
            setIsHost(false);
          }
        });
      } else {
        socket.emit('reconnect-user', room, userName, (success) => {
          if (!success) {
            localStorage.clear();
            setJoined(false);
            setRoom('');
          }
        });
      }
    }

    socket.on('new-question', (data) => {
      console.log('New question received:', data);
      setCurrentQ(data.question);
      setUsers(data.users);
      setVotes({});
      setHasVoted(false);
      setResults(null);
      setTimeLeft(90);
      setStartTime(data.startTime);
    });

    socket.on('vote-update', (updatedVotes) => {
      console.log('Votes updated:', updatedVotes);
      setVotes(updatedVotes);
    });
    
    socket.on('user-joined', (updatedUsers) => {
      console.log('Users updated:', updatedUsers);
      setUsers(updatedUsers);
      setCanStartGame(updatedUsers.length >= 3);
    });
    
    socket.on('user-left', (updatedUsers) => {
      console.log('Users updated after leave:', updatedUsers);
      setUsers(updatedUsers);
      setCanStartGame(updatedUsers.length >= 3);
    });

    socket.on('question-end', (results) => {
      console.log('Question ended with results:', results);
      setResults(results);
      setTimeLeft(0);
    });

    socket.on('room-closed', () => {
      localStorage.clear();
      setJoined(false);
      setRoom('');
      setIsHost(false);
      setUsers([]);
      setVotes({});
      setCurrentQ('');
      setResults(null);
      alert('The game has ended');
    });

    return () => {
      socket.off('new-question');
      socket.off('vote-update');
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('question-end');
      socket.off('room-closed');
    };
  }, [joined, room, isHost, userName]);

  useEffect(() => {
    let timer;
    if (timeLeft > 0 && currentQ && startTime) {
      const updateTimer = () => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const remaining = Math.max(0, 90 - elapsed);
        setTimeLeft(remaining);
      };
      
      timer = setInterval(updateTimer, 100);
      updateTimer(); // Initial update
    }
    return () => clearInterval(timer);
  }, [timeLeft, currentQ, startTime]);

  const createRoom = () => {
    if (!userName.trim()) {
      alert('Please enter your name');
      return;
    }
    socket.emit('create-room', userName, (roomCode) => {
      setRoom(roomCode);
      setJoined(true);
      setIsHost(true);
      // Store data in localStorage
      localStorage.setItem('room', roomCode);
      localStorage.setItem('userName', userName);
      localStorage.setItem('isHost', 'true');
    });
  };

  const joinRoom = () => {
    if (!userName.trim()) {
      alert('Please enter your name');
      return;
    }
    if (!room.trim()) {
      alert('Please enter a room code');
      return;
    }
    socket.emit('join-room', room, userName, (res) => {
      if (res.success) {
        setJoined(true);
        setIsHost(false);
        // Store data in localStorage
        localStorage.setItem('room', room);
        localStorage.setItem('userName', userName);
        localStorage.setItem('isHost', 'false');
      } else {
        alert(res.error);
      }
    });
  };

  const sendQuestion = () => {
    if (!question.trim()) {
      alert('Please enter a question');
      return;
    }
    if (!canStartGame) {
      alert('Need at least 3 players to start the game');
      return;
    }
    socket.emit('send-question', { roomCode: room, question });
    setQuestion('');
  };

  const vote = (vote) => {
    if (!hasVoted) {
      socket.emit('vote', { roomCode: room, user: userName, vote });
      setHasVoted(true);
    }
  };

  const leaveRoom = () => {
    socket.emit('leave-room', room);
    localStorage.clear();
    setJoined(false);
    setRoom('');
    setIsHost(false);
    setUsers([]);
    setVotes({});
    setCurrentQ('');
    setResults(null);
  };

  const endGame = () => {
    if (isHost) {
      console.log('Ending game for room:', room);
      socket.emit('end-game', room);
    }
  };

  if (!joined) {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>FOUNDIES</h1>
        <div style={styles.form}>
          <input 
            style={styles.input}
            placeholder="Enter your name" 
            value={userName} 
            onChange={e => setUserName(e.target.value)} 
          />
          {!showJoinInput ? (
            <div style={styles.buttonGroup}>
              <button style={styles.button} onClick={createRoom}>Create Room</button>
              <button style={styles.button} onClick={() => setShowJoinInput(true)}>Join Game</button>
            </div>
          ) : (
            <div style={styles.joinGroup}>
              <input 
                style={styles.input}
                placeholder="Enter room code" 
                value={room} 
                onChange={e => setRoom(e.target.value.toUpperCase())} 
              />
              <div style={styles.buttonGroup}>
                <button style={styles.button} onClick={joinRoom}>Join</button>
                <button style={styles.button} onClick={() => setShowJoinInput(false)}>Back</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Room: {room}</h1>
        <div style={styles.headerButtons}>
          {isHost && (
            <button style={styles.endButton} onClick={endGame}>End Game</button>
          )}
          <button style={styles.leaveButton} onClick={leaveRoom}>Leave Room</button>
        </div>
      </div>
      {isHost && (
        <>
          <div style={styles.hostControls}>
            <input 
              style={styles.input}
              placeholder="Ask a question" 
              value={question} 
              onChange={e => setQuestion(e.target.value)} 
            />
            <button 
              style={styles.button} 
              onClick={sendQuestion}
              disabled={!canStartGame}
            >
              {canStartGame ? 'Send Question' : 'Need 3+ Players'}
            </button>
          </div>
          <div style={styles.usersList}>
            <h3 style={styles.usersTitle}>Players in Room ({users.length}):</h3>
            <div style={styles.usersGrid}>
              {users.map((user) => (
                <div key={user.id} style={styles.userCard}>
                  <span style={styles.userName}>{user.name}</span>
                  {votes[user.name] && (
                    <span style={styles.userVote}>Voted for: {votes[user.name]}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {currentQ && (
        <div style={styles.questionSection}>
          <h2 style={styles.questionTitle}>Current Question:</h2>
          <p style={styles.question}>{currentQ}</p>
          <div style={styles.timer}>Time Left: {timeLeft}s</div>
          {!isHost && !hasVoted && (
            <div style={styles.voteButtons}>
              {users.map((user) => (
                <button 
                  key={user.id}
                  style={styles.voteButton}
                  onClick={() => vote(user.name)}
                >
                  Vote for {user.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {results && (
        <div style={styles.resultsSection}>
          <h3 style={styles.resultsTitle}>Results:</h3>
          <div style={styles.resultsList}>
            {results.map((result, index) => (
              <div key={result.name} style={styles.resultItem}>
                {index + 1}. {result.name}: {result.count} votes
              </div>
            ))}
          </div>
        </div>
      )}
      {Object.keys(votes).length > 0 && (
        <div style={styles.votesSection}>
          <h3 style={styles.votesTitle}>Current Votes:</h3>
          <div style={styles.votesList}>
            {Object.entries(votes).map(([user, vote]) => (
              <div key={user} style={styles.voteItem}>
                {user} voted for: {vote}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '40px 20px',
    fontFamily: 'Arial, sans-serif',
    backgroundColor: '#1a1a2e',
    color: '#fff',
    minHeight: '100vh',
    backgroundImage: 'radial-gradient(circle at 50% 50%, #16213e 0%, #1a1a2e 100%)',
    position: 'relative',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '40px',
    padding: '20px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '15px',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
  },
  title: {
    color: '#4cc9f0',
    margin: 0,
    fontSize: '3em',
    textTransform: 'uppercase',
    textShadow: '0 0 20px rgba(76, 201, 240, 0.5)',
    fontFamily: '"Arial Black", sans-serif',
  },
  leaveButton: {
    padding: '12px 24px',
    backgroundColor: '#f72585',
    color: '#fff',
    border: 'none',
    borderRadius: '25px',
    cursor: 'pointer',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    boxShadow: '0 0 15px rgba(247, 37, 133, 0.5)',
    transition: 'all 0.3s ease',
    '&:hover': {
      transform: 'scale(1.05)',
      boxShadow: '0 0 20px rgba(247, 37, 133, 0.7)',
    },
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: '30px',
    borderRadius: '15px',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    maxWidth: '600px',
    margin: '0 auto',
  },
  input: {
    padding: '15px',
    fontSize: '16px',
    borderRadius: '25px',
    border: '2px solid #4cc9f0',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: '#fff',
    width: '100%',
    transition: 'all 0.3s ease',
    '&:focus': {
      outline: 'none',
      boxShadow: '0 0 15px rgba(76, 201, 240, 0.5)',
    },
  },
  buttonGroup: {
    display: 'flex',
    gap: '15px',
  },
  joinGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
  },
  button: {
    padding: '15px 30px',
    fontSize: '16px',
    backgroundColor: '#4cc9f0',
    color: '#fff',
    border: 'none',
    borderRadius: '25px',
    cursor: 'pointer',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    transition: 'all 0.3s ease',
    boxShadow: '0 0 15px rgba(76, 201, 240, 0.5)',
    '&:hover': {
      transform: 'scale(1.05)',
      boxShadow: '0 0 20px rgba(76, 201, 240, 0.7)',
    },
    '&:disabled': {
      backgroundColor: '#666',
      cursor: 'not-allowed',
      boxShadow: 'none',
    },
  },
  hostControls: {
    marginBottom: '30px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: '30px',
    borderRadius: '15px',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
  },
  usersList: {
    marginBottom: '30px',
    padding: '30px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '15px',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
  },
  usersTitle: {
    color: '#4cc9f0',
    marginBottom: '20px',
    textTransform: 'uppercase',
    fontSize: '1.5em',
    textShadow: '0 0 10px rgba(76, 201, 240, 0.5)',
  },
  usersGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
    gap: '20px',
  },
  userCard: {
    padding: '20px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '15px',
    boxShadow: '0 0 20px rgba(76, 201, 240, 0.3)',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    border: '1px solid rgba(76, 201, 240, 0.3)',
    transition: 'all 0.3s ease',
    '&:hover': {
      transform: 'translateY(-5px)',
      boxShadow: '0 0 30px rgba(76, 201, 240, 0.5)',
    },
  },
  userName: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#4cc9f0',
    textShadow: '0 0 10px rgba(76, 201, 240, 0.5)',
  },
  userVote: {
    fontSize: '14px',
    color: '#f72585',
  },
  questionSection: {
    marginBottom: '30px',
    padding: '30px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '15px',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
  },
  questionTitle: {
    color: '#4cc9f0',
    marginBottom: '20px',
    textTransform: 'uppercase',
    fontSize: '1.5em',
    textShadow: '0 0 10px rgba(76, 201, 240, 0.5)',
  },
  question: {
    fontSize: '28px',
    color: '#fff',
    textAlign: 'center',
    margin: '30px 0',
    textShadow: '0 0 20px rgba(76, 201, 240, 0.5)',
    fontFamily: '"Arial Black", sans-serif',
  },
  timer: {
    fontSize: '48px',
    color: '#f72585',
    textAlign: 'center',
    margin: '30px 0',
    textShadow: '0 0 20px rgba(247, 37, 133, 0.5)',
    fontFamily: '"Arial Black", sans-serif',
  },
  voteButtons: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
    marginTop: '30px',
  },
  voteButton: {
    padding: '20px 40px',
    fontSize: '20px',
    backgroundColor: '#4cc9f0',
    color: '#fff',
    border: 'none',
    borderRadius: '25px',
    cursor: 'pointer',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    transition: 'all 0.3s ease',
    boxShadow: '0 0 15px rgba(76, 201, 240, 0.5)',
    '&:hover': {
      transform: 'scale(1.05)',
      boxShadow: '0 0 20px rgba(76, 201, 240, 0.7)',
    },
  },
  votesSection: {
    marginTop: '30px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: '30px',
    borderRadius: '15px',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
  },
  votesTitle: {
    color: '#4cc9f0',
    marginBottom: '20px',
    textTransform: 'uppercase',
    fontSize: '1.5em',
    textShadow: '0 0 10px rgba(76, 201, 240, 0.5)',
  },
  votesList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
    gap: '20px',
  },
  voteItem: {
    padding: '20px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '15px',
    textAlign: 'center',
    border: '1px solid rgba(76, 201, 240, 0.3)',
    color: '#4cc9f0',
    transition: 'all 0.3s ease',
    '&:hover': {
      transform: 'translateY(-5px)',
      boxShadow: '0 0 20px rgba(76, 201, 240, 0.5)',
    },
  },
  resultsSection: {
    marginTop: '30px',
    padding: '30px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '15px',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
  },
  resultsTitle: {
    color: '#4cc9f0',
    marginBottom: '20px',
    textAlign: 'center',
    textTransform: 'uppercase',
    fontSize: '2em',
    textShadow: '0 0 10px rgba(76, 201, 240, 0.5)',
  },
  resultsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
  },
  resultItem: {
    padding: '25px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '15px',
    textAlign: 'center',
    fontSize: '24px',
    boxShadow: '0 0 20px rgba(76, 201, 240, 0.3)',
    border: '1px solid rgba(76, 201, 240, 0.3)',
    color: '#4cc9f0',
    transition: 'all 0.3s ease',
    '&:hover': {
      transform: 'translateY(-5px)',
      boxShadow: '0 0 30px rgba(76, 201, 240, 0.5)',
    },
  },
  headerButtons: {
    display: 'flex',
    gap: '10px',
  },
  endButton: {
    padding: '12px 24px',
    backgroundColor: '#f72585',
    color: '#fff',
    border: 'none',
    borderRadius: '25px',
    cursor: 'pointer',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    boxShadow: '0 0 15px rgba(247, 37, 133, 0.5)',
    transition: 'all 0.3s ease',
    '&:hover': {
      transform: 'scale(1.05)',
      boxShadow: '0 0 20px rgba(247, 37, 133, 0.7)',
    },
  },
};

export default App; 