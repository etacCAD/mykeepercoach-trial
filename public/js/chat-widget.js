/**
 * Ted Chat Widget
 * 
 * Uses the `tedChat` Firebase Callable to process messages server-side.
 * No Gemini API key in this file — all AI calls go through the backend.
 */

import { initFirebase } from '/js/firebase-config.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';
import { collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

class ChatWidget {
    constructor() {
        this.isOpen = false;
        this.messages = [];
        this.isWaitingForBot = false;
        this.context = null;
        this._firebase = null;
        this._tedChat = null;

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    async init() {
        this.createWidgetDOM();
        this.attachEventListeners();

        // Expose a method for authenticated views to pass context
        window.setTedContext = (token, userContext) => {
            this.context = userContext;
        };

        // Initialize Firebase and callable (lazy — first message)
        this._initFirebase();

        // Welcome message
        this.addMessage("Hi! I'm Ted, your goalie coach assistant. How can I help you elevate your game today?", 'bot');
    }

    async _initFirebase() {
        try {
            this._firebase = await initFirebase();
            const functions = getFunctions(this._firebase.app);
            this._tedChat = httpsCallable(functions, 'tedChat');
        } catch (err) {
            console.warn('[Ted] Firebase init failed:', err);
        }
    }

    createWidgetDOM() {
        const container = document.createElement('div');
        container.className = 'chat-widget-container';

        container.innerHTML = `
            <div class="chat-widget-panel" id="tedChatPanel">
                <div class="chat-widget-header">
                    <h3 class="chat-widget-title" style="display: flex; align-items: center; gap: 6px;">
                        Coach <span>Ted</span>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="11" width="18" height="10" rx="2"></rect>
                            <circle cx="12" cy="5" r="2"></circle>
                            <path d="M12 7v4"></path>
                            <line x1="8" y1="16" x2="8.01" y2="16"></line>
                            <line x1="16" y1="16" x2="16.01" y2="16"></line>
                        </svg>
                    </h3>
                    <button class="chat-widget-close" id="tedChatClose">×</button>
                </div>
                <div class="chat-widget-messages" id="tedChatMessages"></div>
                <div class="chat-widget-input-area">
                    <input type="text" class="chat-widget-input" id="tedChatInput" placeholder="Ask Ted a question...">
                    <button class="chat-widget-send" id="tedChatSend">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                    </button>
                </div>
            <button class="chat-widget-button" id="tedChatToggle">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
            </button>
        `;

        document.body.appendChild(container);

        this.panel = document.getElementById('tedChatPanel');
        this.messagesContainer = document.getElementById('tedChatMessages');
        this.input = document.getElementById('tedChatInput');
        this.sendBtn = document.getElementById('tedChatSend');
        this.toggleBtn = document.getElementById('tedChatToggle');
        this.closeBtn = document.getElementById('tedChatClose');
    }

    attachEventListeners() {
        this.toggleBtn.addEventListener('click', () => this.togglePanel());
        this.closeBtn.addEventListener('click', () => this.togglePanel());
        this.sendBtn.addEventListener('click', () => this.handleSend());
        this.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSend();
        });
    }

    togglePanel() {
        this.isOpen = !this.isOpen;
        if (this.isOpen) {
            this.panel.classList.add('open');
            this.input.focus();
        } else {
            this.panel.classList.remove('open');
        }
    }

    addMessage(text, sender) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${sender}`;

        const formattedText = text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" style="color: inherit; text-decoration: underline;">$1</a>');
        msgDiv.innerHTML = formattedText;

        this.messagesContainer.appendChild(msgDiv);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

        this.messages.push({
            role: sender === 'bot' ? 'model' : 'user',
            parts: [{ text }]
        });
    }

    showTyping() {
        const indicator = document.createElement('div');
        indicator.className = 'chat-message bot typing';
        indicator.id = 'tedTypingIndicator';
        indicator.innerHTML = `
            <div class="chat-typing-indicator">
                <div class="chat-typing-dot"></div>
                <div class="chat-typing-dot"></div>
                <div class="chat-typing-dot"></div>
            </div>
        `;
        this.messagesContainer.appendChild(indicator);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        this.isWaitingForBot = true;
    }

    removeTyping() {
        const indicator = document.getElementById('tedTypingIndicator');
        if (indicator) indicator.remove();
        this.isWaitingForBot = false;
    }

    async handleSend() {
        const text = this.input.value.trim();
        if (!text || this.isWaitingForBot) return;

        this.input.value = '';
        this.addMessage(text, 'user');
        this.showTyping();

        try {
            // Ensure callable is ready (may not be if init was slow)
            if (!this._tedChat) await this._initFirebase();
            if (!this._tedChat) throw new Error('Chat service not available');

            // Build history (exclude welcome greeting, include everything up to but not latest msg)
            const history = this.messages.slice(1, -1);

            const result = await this._tedChat({
                messages: history.concat([{ role: 'user', parts: [{ text }] }]),
                context: this.context || null,
            });

            const reply = result.data?.reply;
            if (!reply) throw new Error('No reply received');

            this.removeTyping();
            this.addMessage(reply, 'bot');

        } catch (error) {
            console.error('[Ted] Chat error:', error);
            this.removeTyping();
            this.messages.pop(); // Remove the user message from local history

            const errorReplies = [
                "Well string me up and call me a piñata, I completely missed that pass! Care to try again?",
                "Oof, my brain just did a total air-kick on that one. Can you repeat the question?",
                "Looks like my connection just got slide-tackled into the stands! Mind giving that another go?",
                "I just got caught watching the daisies grow in the penalty box. Could you ask that one more time?",
                "VAR is currently reviewing my last thought... and it's a no-goal. Care to take another shot?",
                "Like a bad pass in the midfield, I totally lost track of that. Give me another try!",
                "Sorry, I was too busy daydreaming about saving a top-bin PK! Could you repeat that?",
                "I just got caught totally flat-footed on that one! Could you fire it at me again?",
                "Oops! I let that one slip right through my gloves. What were you saying?",
                "Looks like I just got caught on the wrong side of an offside trap. Can you repeat that?",
                "I'm putting my hand up apologizing to the defense for that one. Care to ask again?",
                "That question must have taken a wicked deflection, because I totally lost it. Give it another go?"
            ];
            const randomReply = errorReplies[Math.floor(Math.random() * errorReplies.length)];
            this.addMessage(randomReply, 'bot');
        }
    }
}

// Initialize widget
window.tedWidget = new ChatWidget();
