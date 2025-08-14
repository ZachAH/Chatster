// Chat.jsx
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

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const generateColor = () => {
  const colors = ['#F56565', '#48BB78', '#4299E1', '#ED8936', '#9F7AEA', '#ECC94B', '#34D399', '#60A5FA', '#FBBF24', '#A78BFA'];
  return colors[Math.floor(Math.random() * colors.length)];
};

export default function Chat({ username, avatarColor, userId }) {
  const [db, setDb] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isBotActive, setIsBotActive] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const messagesEndRef = useRef(null);

  const fakeUsers = [
    { id: 'alice', name: 'Alice', color: '#F56565' },
    { id: 'bob', name: 'Bob', color: '#48BB78' },
    { id: 'charlie', name: 'Charlie', color: '#4299E1' },
    { id: 'dana', name: 'Dana', color: '#ED8936' },
    { id: 'rachel', name: 'Rachel', color: '#9F7AEA' },
    { id: 'tom', name: 'Tom', color: '#ECC94B' },
    { id: 'lisa', name: 'Lisa', color: '#34D399' },
    { id: 'mark', name: 'Mark', color: '#60A5FA' },
    { id: 'nina', name: 'Nina', color: '#FBBF24' },
    { id: 'john', name: 'John', color: '#A78BFA' }
  ];

  const fakeMessages = [
    'Hello there!', 'How’s your day going?', 'React is awesome!', 'Anyone here?',
    'Testing... 1, 2, 3...', '🔥🔥🔥', 'I love coding!', 'Did you see the game last night?'
  ];

  const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY; // at top of Chat.jsx

  const handleSummarizeChat = async () => {
    if (!messages.length || !geminiApiKey || isGeneratingSummary) return;
    setIsGeneratingSummary(true);

    try {
      // Prepare chat history
      const chatHistory = messages.map(msg => `${msg.userId === userId ? 'You' : msg.username}: ${msg.text}`);
      const prompt = `Summarize the following chat conversation:\n\n${chatHistory.join('\n')}`;
      const payload = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${geminiApiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      const summaryText = result?.candidates?.[0]?.content?.parts?.[0]?.text || 'Failed to generate summary.';

      // Save summary in chat
      await addDoc(collection(db, 'chats'), {
        text: summaryText,
        createdAt: serverTimestamp(),
        userId: 'Gemini',
        username: 'Gemini',
        avatarColor: '#9F7AEA',
        isGeminiSummary: true
      });
    } catch (err) {
      console.error('Error generating summary:', err);
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

  const getAvatarColor = (msg) => msg.avatarColor || generateColor();

  // Initialize Firebase
  useEffect(() => {
    const app = initializeApp(firebaseConfig);
    const firestore = getFirestore(app);
    const firebaseAuth = getAuth(app);
    setDb(firestore);

    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      if (!user) signInAnonymously(firebaseAuth).catch(console.error);
    });

    return () => unsubscribe();
  }, []);

  // Listen for messages
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'chats'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, snapshot => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, console.error);
    return () => unsubscribe();
  }, [db]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Bot messages
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

  // Send message
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !db || !userId) return;
    try {
      await addDoc(collection(db, 'chats'), {
        text: newMessage,
        createdAt: serverTimestamp(),
        userId,
        username,
        avatarColor
      });
      setNewMessage('');
    } catch (err) {
      console.error('Error adding message:', err);
    }
  };
  const handleKeyDown = (e) => { if (e.key === 'Enter') handleSendMessage(); };

  // Clear chat
  const handleClearMessages = async () => {
    if (!db) return;
    if (!window.confirm('Clear all messages?')) return;
    const snapshot = await getDocs(collection(db, 'chats'));
    await Promise.all(snapshot.docs.map(docSnap => deleteDoc(doc(db, 'chats', docSnap.id))));
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-gray-100 to-gray-200 font-sans">
      {/* HEADER */}
      <header className="bg-gray-900 text-white p-4 flex items-center justify-between shadow-md space-x-2">
        <h1 className="text-2xl font-bold tracking-wide">Current Talkers</h1>
        <div className="flex space-x-2">
          <button onClick={handleClearMessages} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-md shadow text-white font-semibold">Clear Chat</button>
          <button onClick={() => setIsBotActive(prev => !prev)}
            className={`px-4 py-2 rounded-md font-semibold shadow ${isBotActive ? 'bg-yellow-400 text-black hover:bg-yellow-500' : 'bg-green-600 text-white hover:bg-green-700'}`}>
            {isBotActive ? 'Stop Bot 🤖' : 'Start Bot 🤖'}
          </button>
          <button
  onClick={handleSummarizeChat}
  disabled={isGeneratingSummary}
  className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-4 py-2 rounded-md shadow disabled:opacity-50"
>
  {isGeneratingSummary ? 'Summarizing...' : '✨ Summarize Chat'}
</button>
        </div>
      </header>

      {/* CHAT MESSAGES */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col items-center">
        {messages.map(msg => {
          const isCurrentUser = msg.userId === userId;
          const color = isCurrentUser ? avatarColor : getAvatarColor(msg);
          return (
            <div key={msg.id} className={`flex items-start ${isCurrentUser ? 'justify-end' : 'justify-start'} space-x-2 w-full max-w-md`}>
              {!isCurrentUser && (
                <span style={{ backgroundColor: color, width: 36, height: 36, borderRadius: '50%', display: 'inline-block' }} />
              )}
              <div className="flex flex-col max-w-xs break-words">
                {!msg.isGeminiSummary && (
                  <div className={`text-sm font-semibold mb-1 ${isCurrentUser ? 'text-right' : 'text-left'}`}>
                    {isCurrentUser ? 'You' : msg.username}
                  </div>
                )}
                <div className={`p-3 break-words shadow-md rounded-2xl ${isCurrentUser ? 'bg-blue-500 text-white' : 'bg-white text-gray-800'}`}>
                  {msg.text}
                  <div className="text-xs mt-1 text-right opacity-60">
                    {msg.createdAt?.toDate?.()?.toLocaleTimeString()}
                  </div>
                </div>
              </div>
              {isCurrentUser && (
                <span style={{ backgroundColor: color, width: 36, height: 36, borderRadius: '50%', display: 'inline-block' }} />
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT */}
      <div className="p-4 bg-gray-300 border-t border-gray-400 shadow-inner">
        <div className="flex space-x-2">
          <input
            type="text"
            className="flex-1 p-3 rounded-lg border border-gray-400 focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="Type your message..."
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            onClick={handleSendMessage}
            className="
              bg-gradient-to-r from-blue-500 to-indigo-600 
              hover:from-indigo-600 hover:to-blue-500
              text-white font-bold px-5 py-3 rounded-full 
              shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105
            "
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
