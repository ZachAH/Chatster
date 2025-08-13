import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithCustomToken, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, addDoc, serverTimestamp, query, orderBy, onSnapshot } from 'firebase/firestore';

// Main App component
export default function App() {
  // Check if firebase config and auth token are available in the Canvas environment.
  const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
  const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
  const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
  
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const messagesEndRef = useRef(null);
  
  // Helper function to handle exponential backoff for API calls
  const withBackoff = async (func) => {
    let delay = 1000;
    for (let i = 0; i < 5; i++) {
      try {
        return await func();
      } catch (error) {
        // In a real application, you might check for specific error codes like 429
        console.warn(`API call failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
    throw new Error("API call failed after multiple retries.");
  };

  // Initialize Firebase and set up authentication
  useEffect(() => {
    if (Object.keys(firebaseConfig).length === 0) {
      console.error("Firebase config is missing. Please provide it for a working application.");
      return;
    }

    const app = initializeApp(firebaseConfig);
    const firestore = getFirestore(app);
    const firebaseAuth = getAuth(app);

    setDb(firestore);
    setAuth(firebaseAuth);

    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        if (initialAuthToken) {
          signInWithCustomToken(firebaseAuth, initialAuthToken).catch(console.error);
        } else {
          signInAnonymously(firebaseAuth).catch(console.error);
        }
      }
    });

    return () => unsubscribe();
  }, [firebaseConfig, initialAuthToken]);

  // Set up real-time message listener
  useEffect(() => {
    if (db && userId) {
      const messagesCollection = collection(db, `artifacts/${appId}/public/data/chat_messages`);
      const q = query(messagesCollection, orderBy('createdAt', 'asc'));

      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const fetchedMessages = [];
        querySnapshot.forEach((doc) => {
          fetchedMessages.push({ id: doc.id, ...doc.data() });
        });
        setMessages(fetchedMessages);
      }, (error) => {
        console.error("Error fetching messages: ", error);
      });

      return () => unsubscribe();
    }
  }, [db, userId, appId]);

  // Scroll to the latest message
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Handle sending a new message
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !db || !userId) return;

    try {
      const messagesCollection = collection(db, `artifacts/${appId}/public/data/chat_messages`);
      await withBackoff(() => addDoc(messagesCollection, {
        text: newMessage,
        createdAt: serverTimestamp(),
        userId: userId,
      }));
      setNewMessage('');
    } catch (e) {
      console.error('Error adding document: ', e);
    }
  };

  // Function to summarize the chat using Gemini API
  const handleSummarizeChat = async () => {
    if (messages.length === 0 || isGeneratingSummary) return;

    setIsGeneratingSummary(true);

    try {
      const chatHistory = messages.map(msg => `${msg.userId === userId ? 'You' : 'User'}: ${msg.text}`);
      const prompt = `Summarize the following chat conversation:\n\n${chatHistory.join('\n')}`;

      const geminiPayload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      };
      
      const apiKey = "";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

      const response = await withBackoff(() => fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload)
      }));
      
      const result = await response.json();
      const summaryText = result?.candidates?.[0]?.content?.parts?.[0]?.text || "Failed to generate summary.";

      const messagesCollection = collection(db, `artifacts/${appId}/public/data/chat_messages`);
      await withBackoff(() => addDoc(messagesCollection, {
        text: summaryText,
        createdAt: serverTimestamp(),
        userId: 'Gemini', // Use a special user ID for the Gemini bot
        isGeminiSummary: true,
      }));
      
    } catch (error) {
      console.error('Error summarizing chat:', error);
      const messagesCollection = collection(db, `artifacts/${appId}/public/data/chat_messages`);
      await withBackoff(() => addDoc(messagesCollection, {
        text: 'Error generating summary. Please try again.',
        createdAt: serverTimestamp(),
        userId: 'Gemini',
        isGeminiSummary: true,
      }));
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  // UI rendering
  return (
    <div className="flex flex-col h-screen bg-gray-100 font-inter">
      <header className="bg-gray-800 text-white p-4 flex items-center justify-between shadow-lg">
        <h1 className="text-2xl font-bold">Real-time Chat</h1>
        <button
          onClick={handleSummarizeChat}
          disabled={isGeneratingSummary}
          className="bg-purple-600 text-white p-2 rounded-lg font-bold hover:bg-purple-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
        >
          {isGeneratingSummary ? (
            <span className="flex items-center">
              <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Summarizing...
            </span>
          ) : (
            <>
              <span className="text-xl mr-2">✨</span>
              Summarize Chat
            </>
          )}
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {userId && (
          <p className="text-sm text-center text-gray-500 mb-4">Your User ID: <span className="font-mono bg-gray-300 rounded px-1">{userId}</span></p>
        )}
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-20">
            Start the conversation!
          </div>
        ) : (
          messages.map((msg, index) => (
            <div key={index} className={`flex ${msg.userId === userId ? 'justify-end' : 'justify-start'}`}>
              <div className={`p-3 rounded-lg max-w-sm shadow-md ${msg.isGeminiSummary ? 'bg-purple-200 text-purple-900 border border-purple-500' : (msg.userId === userId ? 'bg-blue-500 text-white' : 'bg-white text-gray-800')}`}>
                <div className="font-semibold text-sm mb-1">{msg.isGeminiSummary ? 'Gemini Summary' : (msg.userId === userId ? 'You' : `User ID: ${msg.userId}`)}</div>
                <div className="text-base">{msg.text}</div>
                <div className="text-xs mt-1 text-right opacity-75">
                  {msg.createdAt?.toDate().toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-4 bg-gray-200 border-t border-gray-300 shadow-inner">
        <div className="flex space-x-2">
          <input
            type="text"
            className="flex-1 p-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            onClick={handleSendMessage}
            className="bg-blue-600 text-white p-3 rounded-lg font-bold hover:bg-blue-700 transition-colors duration-200"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
