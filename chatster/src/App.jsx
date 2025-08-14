// App.jsx
import { useState, useEffect } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { auth } from './firebase'; // your shared Firebase auth
import Chat from './components/chat';
import './App.css';

// Generate a random username
function generateUsername() {
  const num = Math.floor(100 + Math.random() * 900);
  return `User${num}`;
}

// Generate a color (avoid repeating)
let lastColor = null;
function generateColor() {
  const colors = [
    '#F56565', '#48BB78', '#4299E1', '#ED8936', '#9F7AEA', '#ECC94B',
    '#34D399', '#60A5FA', '#FBBF24', '#A78BFA', '#f472b6', '#4ade80',
    '#38bdf8', '#facc15', '#fb923c', '#c084fc', '#f43f5e', '#22d3ee', '#bef264'
  ];
  let newColor;
  do {
    newColor = colors[Math.floor(Math.random() * colors.length)];
  } while (newColor === lastColor);
  lastColor = newColor;
  return newColor;
}

function App() {
  const [username, setUsername] = useState(() => localStorage.getItem('chatUsername') || generateUsername());
  const [avatarColor, setAvatarColor] = useState(() => localStorage.getItem('chatAvatarColor') || generateColor());
  const [userId, setUserId] = useState('');

  // Persist username/color
  useEffect(() => {
    localStorage.setItem('chatUsername', username);
    localStorage.setItem('chatAvatarColor', avatarColor);
  }, [username, avatarColor]);

  // Firebase auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) setUserId(user.uid);
      else signInAnonymously(auth).catch(console.error);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="app-container">
      <h1>ChatterBot V3</h1>
      {username && (
        <div className="user-info">
          <span
            className="avatar"
            style={{
              backgroundColor: avatarColor,
              width: 36,
              height: 36,
              borderRadius: '50%',
              display: 'inline-block',
              marginRight: '8px',
            }}
          />
          <span className="username">{username}</span>
        </div>
      )}
      <Chat username={username} avatarColor={avatarColor} userId={userId} />
    </div>
  );
}

export default App;
