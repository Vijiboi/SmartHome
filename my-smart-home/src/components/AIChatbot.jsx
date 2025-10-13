import React, { useState, useRef, useEffect } from 'react';
import './AIChatbot.css';

const AIChatbot = ({ serverIP = 'localhost:3001' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      type: 'assistant',
      content: 'Hello! I\'m your Smart Home AI assistant. I can help you optimize energy usage, control devices, and answer questions about your smart home system.',
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');
    
    // Add user message to chat
    setMessages(prev => [...prev, {
      type: 'user',
      content: userMessage,
      timestamp: new Date()
    }]);

    setIsLoading(true);

    try {
      const response = await fetch(`http://${serverIP}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: userMessage })
      });

      const data = await response.json();

      if (data.success) {
        setMessages(prev => [...prev, {
          type: 'assistant',
          content: data.response,
          timestamp: new Date(data.timestamp)
        }]);
      } else {
        setMessages(prev => [...prev, {
          type: 'assistant',
          content: 'Sorry, I encountered an error processing your message. Please try again.',
          timestamp: new Date()
        }]);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, {
        type: 'assistant',
        content: 'Sorry, I\'m having trouble connecting to the server. Please check your connection and try again.',
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const quickActions = [
    'Optimize my energy usage',
    'What\'s my current power consumption?',
    'How can I save more energy?',
    'Turn off the lights',
    'Adjust fan speed for comfort',
    'Show energy analytics'
  ];

  const handleQuickAction = (action) => {
    setInputMessage(action);
  };

  return (
    <>
      {/* Chatbot Toggle Button */}
      <div 
        className={`chatbot-toggle ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="chatbot-icon">🤖</span>
        {!isOpen && <span className="chatbot-badge">AI</span>}
      </div>

      {/* Chatbot Window */}
      {isOpen && (
        <div className="chatbot-window">
          <div className="chatbot-header">
            <div className="chatbot-title">
              <span className="chatbot-avatar">🤖</span>
              <div>
                <div className="chatbot-name">Smart Home AI</div>
                <div className="chatbot-status">Online</div>
              </div>
            </div>
            <button 
              className="chatbot-close"
              onClick={() => setIsOpen(false)}
            >
              ×
            </button>
          </div>

          <div className="chatbot-messages">
            {messages.map((message, index) => (
              <div 
                key={index} 
                className={`message ${message.type}`}
              >
                <div className="message-content">
                  {message.content}
                </div>
                <div className="message-time">
                  {formatTime(message.timestamp)}
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="message assistant">
                <div className="message-content typing">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions */}
          {messages.length === 1 && (
            <div className="quick-actions">
              <div className="quick-actions-title">Quick Actions:</div>
              <div className="quick-actions-grid">
                {quickActions.map((action, index) => (
                  <button
                    key={index}
                    className="quick-action-btn"
                    onClick={() => handleQuickAction(action)}
                  >
                    {action}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="chatbot-input">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message... (Press Enter to send)"
              rows={1}
              disabled={isLoading}
            />
            <button 
              onClick={sendMessage}
              disabled={!inputMessage.trim() || isLoading}
              className="send-button"
            >
              <span className="send-icon">➤</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default AIChatbot;