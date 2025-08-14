import { useState, useEffect } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { auth } from './firebase'; // shared Firebase auth
import Chat from './components/chat';
import './App.css';

function generateUsername() {
  const num = Math.floor(100 + Math.random() * 900);
  return `User${num}`;
}

function generateColor() {
  const colors = ['#F56565', '#48BB78', '#4299E1', '#ED8936', '#9F7AEA', '#ECC94B', '#FFFFFF'];
  return colors[Math.floor(Math.random() * colors.length)];
}

function App() {
  // Initialize with localStorage or generate defaults
  const [username, setUsername] = useState(() => localStorage.getItem('chatUsername') || generateUsername());
  const [avatarColor, setAvatarColor] = useState(() => localStorage.getItem('chatAvatarColor') || generateColor());
  const [userId, setUserId] = useState('');

  // Persist to localStorage whenever username or avatarColor changes
  useEffect(() => {
    localStorage.setItem('chatUsername', username);
    localStorage.setItem('chatAvatarColor', avatarColor);
  }, [username, avatarColor]);

  // Handle Firebase auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        signInAnonymously(auth).catch(console.error);
      }
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
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'inline-block',
              marginRight: '8px',
            }}
          ></span>
          <span className="username">{username}</span>
        </div>
      )}
      <Chat username={username} avatarColor={avatarColor} userId={userId} />
    </div>
  );
}

export default App;
