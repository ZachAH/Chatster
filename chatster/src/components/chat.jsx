import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  getDocs,
  deleteDoc,
  doc
} from 'firebase/firestore';

// Firebase Config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Utility: Generate random color
const generateColor = () => {
  const colors = ['#F56565', '#48BB78', '#4299E1', '#ED8936', '#9F7AEA', '#ECC94B', '#FFFFFF'];
  return colors[Math.floor(Math.random() * colors.length)];
};

export default function Chat({ username, avatarColor, userId }) {
  const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;

  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isBotActive, setIsBotActive] = useState(false);
  const messagesEndRef = useRef(null);

  const fakeUsers = [
    { id: 'alice', name: 'Alice', color: '#f87171' },
    { id: 'bob', name: 'Bob', color: '#60a5fa' },
    { id: 'charlie', name: 'Charlie', color: '#fbbf24' },
    { id: 'dana', name: 'Dana', color: '#34d399' },
    { id: 'rachel', name: 'Rachel', color: '#ffffff' }
  ];

  const fakeMessages = [
    'Hello there!', 'How’s your day going?', 'This chat app is cool 😎',
    'Anyone here?', 'React is awesome!', 'Testing... 1, 2, 3...', '🔥🔥🔥',
    'What’s everyone up to?', 'I love coding!', 'Did you see the game last night?',
    'Coffee or tea?', 'LOL 😂', 'Who wants to collaborate?', 'Can someone help me debug?',
    'This is so much fun!', '😅 Oops, my bad!', 'Have you tried Vite yet?',
    'Chatting is relaxing 🛋️', 'Good vibes only ✨', 'I’m a bot, but I’m friendly 🤖',
    'Wow who made this?!!', 'Go BENGALS!!!!', 'Who else know the Bengals are going to the superbowl this year!!??'
  ];

  // Always return a color for a message
  const getAvatarColor = (msg) => msg.avatarColor || generateColor();

  const withBackoff = async (func) => {
    let delay = 1000;
    for (let i = 0; i < 5; i++) {
      try {
        return await func();
      } catch (error) {
        console.warn(`API call failed, retrying in ${delay}ms...`);
        await new Promise(res => setTimeout(res, delay));
        delay *= 2;
      }
    }
    throw new Error('API call failed after multiple retries.');
  };

  // Initialize Firebase
  useEffect(() => {
    const app = initializeApp(firebaseConfig);
    const firestore = getFirestore(app);
    const firebaseAuth = getAuth(app);

    setDb(firestore);
    setAuth(firebaseAuth);

    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      if (!user) signInAnonymously(firebaseAuth).catch(console.error);
    });

    return () => unsubscribe();
  }, []);

  // Listen for chat messages
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'chats'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q,
      snapshot => setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
      err => console.error('Error fetching messages:', err)
    );
    return () => unsubscribe();
  }, [db]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Bot activity
  useEffect(() => {
    if (!isBotActive || !db) return;
    const interval = setInterval(() => {
      const randomUser = fakeUsers[Math.floor(Math.random() * fakeUsers.length)];
      const randomMessage = fakeMessages[Math.floor(Math.random() * fakeMessages.length)];

      addDoc(collection(db, 'chats'), {
        text: randomMessage,
        createdAt: serverTimestamp(),
        userId: randomUser.id,
        username: randomUser.name,
        avatarColor: randomUser.color || generateColor()
      }).catch(console.error);
    }, 3000);

    return () => clearInterval(interval);
  }, [isBotActive, db]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !db || !userId) return;
    try {
      await withBackoff(() =>
        addDoc(collection(db, 'chats'), {
          text: newMessage,
          createdAt: serverTimestamp(),
          userId,
          username,
          avatarColor: avatarColor || generateColor()
        })
      );
      setNewMessage('');
    } catch (err) {
      console.error('Error adding message:', err);
    }
  };

  const handleSummarizeChat = async () => {
    if (!messages.length || !geminiApiKey || isGeneratingSummary) return;
    setIsGeneratingSummary(true);

    try {
      const chatHistory = messages.map(msg => `${msg.userId === userId ? 'You' : 'User'}: ${msg.text}`);
      const prompt = `Summarize the following chat conversation:\n\n${chatHistory.join('\n')}`;
      const payload = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${geminiApiKey}`;

      const response = await withBackoff(() => fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }));

      const result = await response.json();
      const summaryText = result?.candidates?.[0]?.content?.parts?.[0]?.text || 'Failed to generate summary.';

      await withBackoff(() => addDoc(collection(db, 'chats'), {
        text: summaryText,
        createdAt: serverTimestamp(),
        userId: 'Gemini',
        username: 'Gemini',
        avatarColor: '#9F7AEA', // always has a color
        isGeminiSummary: true
      }));
    } catch (err) {
      console.error('Error summarizing chat:', err);
      await addDoc(collection(db, 'chats'), {
        text: 'Error generating summary. Please try again.',
        createdAt: serverTimestamp(),
        userId: 'Gemini',
        username: 'Gemini',
        avatarColor: '#9F7AEA',
        isGeminiSummary: true
      });
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleClearMessages = async () => {
    if (!db) return;
    if (!window.confirm('Are you sure you want to clear all chat messages?')) return;

    try {
      const snapshot = await getDocs(collection(db, 'chats'));
      const deletions = snapshot.docs.map(docSnap => deleteDoc(doc(db, 'chats', docSnap.id)));
      await Promise.all(deletions);
    } catch (err) {
      console.error('Error clearing messages:', err);
    }
  };

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleSendMessage(); };

  return (
    <div className="flex flex-col h-screen bg-gray-100 font-inter">
      <header className="bg-gray-800 text-white p-4 flex items-center justify-between shadow-lg space-x-2">
        <h1 className="text-2xl font-bold">Real-time Chat</h1>
        <button onClick={handleClearMessages} className="bg-red-600 text-white p-2 rounded-lg hover:bg-red-700">🗑 Clear Chat</button>
        <button onClick={() => setIsBotActive(prev => !prev)} className={`p-2 rounded-lg font-bold ${isBotActive ? 'bg-yellow-500 text-black' : 'bg-green-600 text-white'}`}>
          {isBotActive ? '🤖 Stop Bot' : '🤖 Start Bot'}
        </button>
        <button onClick={handleSummarizeChat} disabled={isGeneratingSummary} className="bg-purple-600 text-white p-2 rounded-lg hover:bg-purple-700 disabled:opacity-50">
          {isGeneratingSummary ? 'Summarizing...' : '✨ Summarize Chat'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {userId && (
          <p className="text-sm text-center text-gray-500 mb-4">
            Your User ID: <span className="font-mono bg-gray-300 rounded px-1">{userId}</span>
          </p>
        )}
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-20">Start the conversation!</div>
        ) : messages.map(msg => (
          <div key={msg.id} className={`flex items-end ${msg.userId === userId ? 'justify-end' : 'justify-start'}`}>
            {msg.userId !== userId && (
              <span className="avatar mr-2" style={{ backgroundColor: getAvatarColor(msg), width: 32, height: 32, borderRadius: '50%' }} />
            )}
            <div className={`p-3 rounded-lg max-w-sm shadow-md ${msg.isGeminiSummary ? 'bg-purple-200 text-purple-900 border border-purple-500' : msg.userId === userId ? 'bg-blue-500 text-white' : 'bg-white text-gray-800'}`}>
              <div className="font-semibold text-sm mb-1">{msg.isGeminiSummary ? 'Gemini Summary' : msg.userId === userId ? 'You' : msg.username || `User ID: ${msg.userId}`}</div>
              <div className="text-base">{msg.text}</div>
              <div className="text-xs mt-1 text-right opacity-75">{msg.createdAt?.toDate?.()?.toLocaleTimeString()}</div>
            </div>
            {msg.userId === userId && (
              <span className="avatar ml-2" style={{ backgroundColor: avatarColor, width: 32, height: 32, borderRadius: '50%' }} />
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-gray-200 border-t border-gray-300 shadow-inner">
        <div className="flex space-x-2">
          <input type="text" className="flex-1 p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500" placeholder="Type a message..." value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={handleKeyDown} />
          <button onClick={handleSendMessage} className="bg-blue-600 text-white p-3 rounded-lg font-bold hover:bg-blue-700">Send</button>
        </div>
      </div>
    </div>
  );
}
