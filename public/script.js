const socket = io();
let currentAgent = 'clippy';
let stage;
let agentSprite;
let nickname = '';
let currentRoom = 'default';
let remoteAgents = new Map(); // Store other users' agents
let isTyping = false;
let typingTimeout;
let isCommanding = false;
let mutedAgents = new Set(); // Store muted agent IDs
let speechBubbleTimeout; // For auto-closing speech bubbles

let agentConfig = {
    bonzi: {
        spritew: 200,
        spriteh: 160,
        w: 3400,
        h: 3360,
        toppad: 0,
        anims: {
            idle: 0,
            enter: [277, 302, "idle", 0.25],
            leave: [16, 39, 40, 0.25]
        },
        image: 'https://raw.githubusercontent.com/Rafafrias2012/BonziWORLD-V7.8.0/refs/heads/main/client/img/agents/purple.png'
    },
    peedy: {
        spritew: 160,
        spriteh: 128,
        w: 4000,
        h: 4095,
        toppad: 12,
        anims: {
            idle: 0,
            enter: [659, 681, "idle", 0.25],
            leave: [23, 47, 47, 0.25]
        },
        image: 'https://raw.githubusercontent.com/Rafafrias2012/BonziWORLD-V7.8.0/refs/heads/main/client/img/agents/peedy.png'
    },
    clippy: {
        spritew: 124,
        spriteh: 93,
        w: 3348,
        h: 3162,
        toppad: 40,
        anims: {
            idle: 0,
            enter: [410, 416, "idle", 0.25],
            leave: {frames: [0].concat(range(364, 411)), speed: 0.25}
        },
        image: 'https://raw.githubusercontent.com/Rafafrias2012/BonziWORLD-V7.8.0/refs/heads/main/client/img/agents/clippy.png'
    }
};

// Place agent at random position
function placeAgentRandomly() {
    const agentContainer = document.getElementById('agent-container');
    const minX = 10;
    const minY = 40;
    const maxX = window.innerWidth - 200 - minX;
    const maxY = window.innerHeight - 200 - minY - 30; // Subtracting taskbar height
    
    const randomX = Math.floor(Math.random() * maxX) + minX;
    const randomY = Math.floor(Math.random() * maxY) + minY;
    
    agentContainer.style.left = randomX + 'px';
    agentContainer.style.top = randomY + 'px';
    
    // Update nametag
    document.querySelector('.nametag-text').textContent = nickname;
    
    // Inform server of position
    socket.emit('updatePosition', { x: randomX, y: randomY });
}

// Initialize CreateJS
function initAgent() {
    stage = new createjs.Stage("agent-canvas");
    const config = agentConfig[currentAgent];
    
    const image = new Image();
    image.src = config.image;
    image.onload = () => {
        agentSprite = new createjs.Sprite(new createjs.SpriteSheet({
            images: [image],
            frames: {
                width: config.spritew,
                height: config.spriteh,
                count: Math.floor(config.w / config.spritew) * Math.floor(config.h / config.spriteh)
            },
            animations: config.anims
        }));
        
        stage.addChild(agentSprite);
        agentSprite.gotoAndPlay("enter");
        createjs.Ticker.addEventListener("tick", stage);
    };
    
    // Make agent draggable
    makeAgentDraggable();
    placeAgentRandomly();
    
    // Add speech bubble click handler
    setupSpeechBubbleClickHandler();
    
    // Add context menu functionality
    setupAgentContextMenu();
}

// Create remote agent
function createRemoteAgent(userData) {
    const remoteAgentContainer = document.createElement('div');
    remoteAgentContainer.className = 'remote-agent';
    remoteAgentContainer.id = `agent-${userData.id}`;
    remoteAgentContainer.style.left = `${userData.position.x}px`;
    remoteAgentContainer.style.top = `${userData.position.y}px`;
    
    const nametag = document.createElement('div');
    nametag.className = 'agent-nametag';
    
    const nametagText = document.createElement('span');
    nametagText.className = 'nametag-text';
    nametagText.textContent = userData.nickname;
    
    const statusIndicator = document.createElement('span');
    statusIndicator.className = 'status-indicator';
    
    nametag.appendChild(nametagText);
    nametag.appendChild(statusIndicator);
    
    const canvas = document.createElement('canvas');
    canvas.className = 'remote-agent-canvas';
    canvas.id = `canvas-${userData.id}`;
    canvas.width = 200;
    canvas.height = 200;
    
    const speechBubble = document.createElement('div');
    speechBubble.className = 'speech-bubble';
    speechBubble.id = `speech-${userData.id}`;
    
    // Add click handler to close speech bubble
    speechBubble.addEventListener('click', () => {
        speechBubble.style.display = 'none';
    });
    
    remoteAgentContainer.appendChild(nametag);
    remoteAgentContainer.appendChild(canvas);
    remoteAgentContainer.appendChild(speechBubble);
    
    document.getElementById('remote-agents-container').appendChild(remoteAgentContainer);
    
    // Initialize CreateJS for remote agent
    const remoteStage = new createjs.Stage(canvas.id);
    const config = agentConfig[userData.agent];
    
    const image = new Image();
    image.src = config.image;
    image.onload = () => {
        const remoteSprite = new createjs.Sprite(new createjs.SpriteSheet({
            images: [image],
            frames: {
                width: config.spritew,
                height: config.spriteh,
                count: Math.floor(config.w / config.spritew) * Math.floor(config.h / config.spriteh)
            },
            animations: config.anims
        }));
        
        remoteStage.addChild(remoteSprite);
        remoteSprite.gotoAndPlay("idle");
        createjs.Ticker.addEventListener("tick", remoteStage);
        
        // Store remote agent data
        remoteAgents.set(userData.id, {
            container: remoteAgentContainer,
            stage: remoteStage,
            sprite: remoteSprite,
            speechBubble,
            statusIndicator,
            muted: false
        });
        
        // Add context menu for remote agent
        setupRemoteAgentContextMenu(remoteAgentContainer, userData.id);
    };
}

// Setup speech bubble click handler
function setupSpeechBubbleClickHandler() {
    const speechBubble = document.getElementById('speech-bubble');
    speechBubble.addEventListener('click', () => {
        speechBubble.style.display = 'none';
        if (speechBubbleTimeout) {
            clearTimeout(speechBubbleTimeout);
        }
    });
}

// Setup context menu for local agent
function setupAgentContextMenu() {
    const agentContainer = document.getElementById('agent-container');
    const contextMenu = document.getElementById('agent-context-menu');
    
    agentContainer.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        
        // Position context menu
        contextMenu.style.left = `${e.pageX}px`;
        contextMenu.style.top = `${e.pageY}px`;
        contextMenu.style.display = 'block';
        
        // Set close speech bubble action
        const closeBubbleItem = contextMenu.querySelector('[data-action="close"]');
        const speechBubble = document.getElementById('speech-bubble');
        
        if (speechBubble.style.display === 'block' || speechBubble.style.display === '') {
            closeBubbleItem.classList.remove('disabled');
        } else {
            closeBubbleItem.classList.add('disabled');
        }
    });
}

// Setup context menu for remote agent
function setupRemoteAgentContextMenu(agentContainer, agentId) {
    const contextMenu = document.getElementById('agent-context-menu');
    
    agentContainer.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        
        // Position context menu
        contextMenu.style.left = `${e.pageX}px`;
        contextMenu.style.top = `${e.pageY}px`;
        contextMenu.style.display = 'block';
        
        // Store which agent the context menu is for
        contextMenu.dataset.targetAgent = agentId;
        
        // Configure menu items
        const closeBubbleItem = contextMenu.querySelector('[data-action="close"]');
        const muteItem = contextMenu.querySelector('[data-action="mute"]');
        const unmuteItem = contextMenu.querySelector('[data-action="unmute"]');
        
        const speechBubble = document.getElementById(`speech-${agentId}`);
        const isMuted = mutedAgents.has(agentId);
        
        // Enable/disable close bubble option
        if (speechBubble.style.display === 'block' || speechBubble.style.display === '') {
            closeBubbleItem.classList.remove('disabled');
        } else {
            closeBubbleItem.classList.add('disabled');
        }
        
        // Show appropriate mute/unmute option
        if (isMuted) {
            muteItem.style.display = 'none';
            unmuteItem.style.display = 'block';
        } else {
            muteItem.style.display = 'block';
            unmuteItem.style.display = 'none';
        }
    });
}

// Handle context menu actions
document.addEventListener('click', (e) => {
    const contextMenu = document.getElementById('agent-context-menu');
    
    // Hide context menu when clicking elsewhere
    if (!contextMenu.contains(e.target)) {
        contextMenu.style.display = 'none';
        return;
    }
    
    // Handle menu item clicks
    if (e.target.classList.contains('context-menu-item')) {
        const action = e.target.dataset.action;
        const agentId = contextMenu.dataset.targetAgent;
        
        if (action === 'close') {
            // Close speech bubble
            if (agentId) {
                const speechBubble = document.getElementById(`speech-${agentId}`);
                speechBubble.style.display = 'none';
            } else {
                const speechBubble = document.getElementById('speech-bubble');
                speechBubble.style.display = 'none';
                if (speechBubbleTimeout) {
                    clearTimeout(speechBubbleTimeout);
                }
            }
        } else if (action === 'mute') {
            // Mute agent
            if (agentId) {
                mutedAgents.add(agentId);
                remoteAgents.get(agentId).muted = true;
            }
        } else if (action === 'unmute') {
            // Unmute agent
            if (agentId) {
                mutedAgents.delete(agentId);
                remoteAgents.get(agentId).muted = false;
            }
        }
        
        contextMenu.style.display = 'none';
    }
});

// Helper function for range
function range(start, end) {
    return Array.from({length: end - start + 1}, (_, i) => start + i);
}

// Make agent draggable with constraints
function makeAgentDraggable() {
    const agentContainer = document.getElementById('agent-container');
    let isDragging = false;
    let offsetX, offsetY;
    
    agentContainer.addEventListener('mousedown', (e) => {
        // Only handle left mouse button for dragging
        if (e.button !== 0) return;
        
        isDragging = true;
        offsetX = e.clientX - agentContainer.offsetLeft;
        offsetY = e.clientY - agentContainer.offsetTop;
        agentContainer.style.zIndex = '50'; // Bring to front when dragging
    });
    
    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const minX = 10;
            const minY = 40;
            const maxX = window.innerWidth - 200 - minX;
            const maxY = window.innerHeight - 200 - minY - 30; // Subtracting taskbar height
            
            let newX = e.clientX - offsetX;
            let newY = e.clientY - offsetY;
            
            // Apply constraints
            newX = Math.max(minX, Math.min(newX, maxX));
            newY = Math.max(minY, Math.min(newY, maxY));
            
            agentContainer.style.left = newX + 'px';
            agentContainer.style.top = newY + 'px';
            
            // Send position update to server
            socket.emit('updatePosition', { x: newX, y: newY });
        }
    });
    
    document.addEventListener('mouseup', () => {
        isDragging = false;
        agentContainer.style.zIndex = '20';
    });
}

// Login functionality
document.getElementById('login-btn').addEventListener('click', () => {
    nickname = document.getElementById('nickname').value;
    currentRoom = document.getElementById('room').value || 'default';
    
    if (nickname) {
        socket.emit('login', { nickname, room: currentRoom, agent: currentAgent });
        document.getElementById('login-window').style.display = 'none';
        document.getElementById('chat-screen').style.display = 'block';
        document.getElementById('room-id').textContent = currentRoom;
        initAgent();
    }
});

// Typing indicator
document.getElementById('message-input').addEventListener('input', (e) => {
    const message = e.target.value.trim();
    
    // Clear any existing timeout
    if (typingTimeout) {
        clearTimeout(typingTimeout);
    }
    
    // Check if the message is a command
    if (message.startsWith('/')) {
        // Show commanding indicator
        showCommandingIndicator();
    } else if (message.length > 0) {
        // Show typing indicator
        showTypingIndicator();
    } else {
        // Remove indicators
        hideStatusIndicators();
    }
    
    // Send typing status to server
    socket.emit('typingStatus', { 
        isTyping: message.length > 0,
        isCommanding: message.startsWith('/')
    });
    
    // Set timeout to clear typing indicator after 2 seconds of inactivity
    typingTimeout = setTimeout(() => {
        hideStatusIndicators();
        socket.emit('typingStatus', { isTyping: false, isCommanding: false });
    }, 2000);
});

// Show typing indicator
function showTypingIndicator() {
    isTyping = true;
    isCommanding = false;
    const statusIndicator = document.querySelector('#agent-container .status-indicator');
    statusIndicator.classList.remove('commanding');
    statusIndicator.classList.add('typing');
}

// Show commanding indicator
function showCommandingIndicator() {
    isTyping = false;
    isCommanding = true;
    const statusIndicator = document.querySelector('#agent-container .status-indicator');
    statusIndicator.classList.remove('typing');
    statusIndicator.classList.add('commanding');
}

// Hide status indicators
function hideStatusIndicators() {
    isTyping = false;
    isCommanding = false;
    const statusIndicator = document.querySelector('#agent-container .status-indicator');
    statusIndicator.classList.remove('typing', 'commanding');
}

// Chat functionality
document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const input = document.getElementById('message-input');
    const message = input.value.trim();
    
    if (message) {
        if (message.startsWith('/')) {
            handleCommand(message);
        } else {
            socket.emit('chatMessage', { message });
            
            // Show speech bubble for current user
            showSpeechBubble('speech-bubble', message);
        }
        input.value = '';
        hideStatusIndicators();
        socket.emit('typingStatus', { isTyping: false, isCommanding: false });
    }
}

// Show speech bubble with auto-close
function showSpeechBubble(bubbleId, message) {
    const speechBubble = document.getElementById(bubbleId);
    speechBubble.textContent = message;
    speechBubble.style.display = 'block';
    
    // Clear existing timeout if any
    if (speechBubbleTimeout) {
        clearTimeout(speechBubbleTimeout);
    }
    
    // Set auto-close timeout (5 seconds)
    speechBubbleTimeout = setTimeout(() => {
        speechBubble.style.display = 'none';
    }, 5000);
}

function handleCommand(command) {
    const parts = command.slice(1).split(' ');
    switch (parts[0]) {
        case 'name':
            if (parts[1]) {
                nickname = parts[1];
                socket.emit('login', { nickname, room: currentRoom, agent: currentAgent });
                document.querySelector('.nametag-text').textContent = nickname;
            }
            break;
        case 'changeagent':
            if (parts[1] && ['bonzi', 'peedy', 'clippy'].includes(parts[1])) {
                currentAgent = parts[1];
                socket.emit('changeAgent', currentAgent);
                initAgent();
            }
            break;
    }
}

// Socket event handlers
socket.on('message', (data) => {
    const chatContainer = document.getElementById('chat-container');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv.textContent = `${data.nickname}: ${data.message}`;
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    // If message is from another user, show their speech bubble
    if (data.id !== socket.id && remoteAgents.has(data.id)) {
        const remoteAgent = remoteAgents.get(data.id);
        
        // Check if agent is muted
        if (!remoteAgent.muted) {
            showSpeechBubble(`speech-${data.id}`, data.message);
            
            // Text-to-speech
            speak.play(data.message);
        }
    }
});

socket.on('typingStatus', (data) => {
    if (data.id !== socket.id && remoteAgents.has(data.id)) {
        const statusIndicator = remoteAgents.get(data.id).statusIndicator;
        
        statusIndicator.classList.remove('typing', 'commanding');
        
        if (data.isTyping) {
            statusIndicator.classList.add('typing');
        } else if (data.isCommanding) {
            statusIndicator.classList.add('commanding');
        }
    }
});

socket.on('currentUsers', (users) => {
    // Create agents for all existing users
    users.forEach(user => {
        createRemoteAgent(user);
    });
});

socket.on('userJoined', (userData) => {
    appendSystemMessage(`${userData.nickname} joined the chat`);
    createRemoteAgent(userData);
});

socket.on('userLeft', (data) => {
    appendSystemMessage(`${data.nickname} left the chat`);
    
    // Remove remote agent
    if (remoteAgents.has(data.id)) {
        const container = document.getElementById(`agent-${data.id}`);
        if (container) {
            container.remove();
        }
        remoteAgents.delete(data.id);
        mutedAgents.delete(data.id);
    }
});

socket.on('agentMoved', (data) => {
    if (remoteAgents.has(data.id)) {
        const agentContainer = document.getElementById(`agent-${data.id}`);
        if (agentContainer) {
            agentContainer.style.left = `${data.position.x}px`;
            agentContainer.style.top = `${data.position.y}px`;
        }
    }
});

socket.on('agentChanged', (data) => {
    if (remoteAgents.has(data.id)) {
        // Remove old agent
        const container = document.getElementById(`agent-${data.id}`);
        if (container) {
            container.remove();
        }
        remoteAgents.delete(data.id);
        
        // Create new agent with updated agent type
        createRemoteAgent({
            id: data.id,
            nickname: data.nickname,
            agent: data.agent,
            position: {
                x: parseInt(container.style.left),
                y: parseInt(container.style.top)
            }
        });
    }
});

function appendSystemMessage(message) {
    const chatContainer = document.getElementById('chat-container');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message system';
    messageDiv.textContent = message;
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Window dragging functionality for chat screen
document.querySelectorAll('.window').forEach(window => {
    const titleBar = window.querySelector('.title-bar');
    let isDragging = false;
    let offsetX, offsetY;
    
    titleBar.addEventListener('mousedown', (e) => {
        isDragging = true;
        offsetX = e.clientX - window.offsetLeft;
        offsetY = e.clientY - window.offsetTop;
    });
    
    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            window.style.left = (e.clientX - offsetX) + 'px';
            window.style.top = (e.clientY - offsetY) + 'px';
        }
    });
    
    document.addEventListener('mouseup', () => {
        isDragging = false;
    });
});

// Taskbar button functionality
document.getElementById('chat-taskbar-btn').addEventListener('click', () => {
    const chatScreen = document.getElementById('chat-screen');
    if (chatScreen.style.display === 'none') {
        chatScreen.style.display = 'block';
    } else {
        chatScreen.style.display = 'none';
    }
});

// Window controls (minimize, maximize, close)
document.querySelectorAll('.title-bar-controls button').forEach(button => {
    button.addEventListener('click', (e) => {
        const control = e.target.getAttribute('aria-label');
        const window = e.target.closest('.window');
        
        if (control === 'Close') {
            window.style.display = 'none';
        } else if (control === 'Minimize') {
            window.style.display = 'none';
        }
    });
});

// Help button functionality
document.getElementById('help-btn').addEventListener('click', () => {
    window.open('readme.html', '_blank', 'width=550,height=650');
}); 
