import { useState, useRef, useEffect } from "react";
import axios from "axios";
import { Toaster, toast } from "react-hot-toast";
import { v4 as uuidv4 } from "uuid";

function App() {
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  // Create a session ID when the component mounts and store it in state.
  // This ensures the same ID is used for the entire session.
  const [sessionId] = useState(uuidv4());

  const chatContainerRef = useRef(null);

  useEffect(() => {
    // Scroll to the bottom of the chat container whenever a new message is added
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message) {
      toast.error("Please enter a message.");
      return;
    }

    const currentUserMessage = { role: "user", content: message };
    setChatHistory((prev) => [...prev, currentUserMessage]);
    setLoading(true);
    setMessage("");

    try {
      const apiUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
      const response = await axios.post(`${apiUrl}/chat`, {
        message: message,
        sessionId: sessionId, // Send the session ID to the backend
      });

      const aiResponse = { role: "ai", content: response.data.response };
      setChatHistory((prev) => [...prev, aiResponse]);
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("Failed to get response. Please check the console.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen flex flex-col justify-center items-center p-4 font-sans">
      <Toaster position="top-center" />
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl flex flex-col h-[90vh]">
        <div className="bg-gray-800 text-white p-4 rounded-t-2xl flex items-center">
          <h1 className="text-xl font-bold tracking-wider">Corporate Expenses AI</h1>
        </div>
        <p class="text-gray-400 justify-end">&copy; 2025 Shadrack Kirui.</p>

        <div ref={chatContainerRef} className="flex-1 p-6 overflow-y-auto bg-gray-100">
          <div className="space-y-4">
            {chatHistory.map((chat, index) => (
              <div
                key={index}
                className={`flex items-end gap-3 animate-fade-in ${
                  chat.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {chat.role === "ai" && (
                  <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    AI
                  </div>
                )}
                <div
                  className={`max-w-xl px-4 py-3 rounded-2xl shadow-md ${
                    chat.role === "user"
                      ? "bg-blue-600 text-white rounded-br-none"
                      : "bg-white text-gray-800 rounded-bl-none"
                  }`}
                >
                  {chat.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-end gap-3 animate-fade-in">
                <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  AI
                </div>
                <div className="bg-white text-gray-800 rounded-2xl rounded-bl-none shadow-md px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce"></span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t bg-white rounded-b-2xl">
          <form onSubmit={handleSubmit} className="flex items-center space-x-2">
            <input
              type="text"
              value={message}
              id="messageInput"
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ask about the expense policy or submit a claim..."
              className="flex-1 px-4 py-2 bg-gray-100 border-transparent rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-blue-300 transition-colors"
              disabled={loading}
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default App;
