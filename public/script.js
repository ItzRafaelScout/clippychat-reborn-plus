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
let replyingTo = null; // Store message being replied to
let lastMessages = new Map(); // Store last message from each agent
let currentHat = null; // Current hat data
let hatDragging = false; // Is the hat being dragged
let targetAgent = null; // Agent ID for context menu actions
let isAdmin = false;
let activePoll = null; // Current active poll
const ADMIN_PASSWORD = "agentamber#1337";
const ADMIN_NAME = "AGENT AMBER";

// Hat image URLs
const hatImages = {
    kamala: 'https://bonzi.gay/img/bonzi/kamala.png',
    elon: 'https://bonzi.gay/img/bonzi/elon.png',
    top_hat: 'https://bonzi.gay/img/bonzi/tophat.png',
    cap: 'https://bonzi.gay/img/bonzi/maga.png'
};

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
    
    // Initialize hat container
    initHatContainer();
}

// Initialize hat container
function initHatContainer() {
    const hatContainer = document.getElementById('local-hat');
    
    // If we have a current hat, apply it
    if (currentHat) {
        applyHat(currentHat, hatContainer);
    }
}

// Apply hat to a container
function applyHat(hatData, container) {
    // Replace jQuery with vanilla JS
    container.innerHTML = '';
    
    // Create hat image using vanilla JS
    const hatImg = document.createElement('img');
    hatImg.src = hatData.url;
    hatImg.style.width = (hatData.size * 100) + 'px';
    hatImg.style.left = hatData.x + 'px';
    hatImg.style.top = hatData.y + 'px';
    
    container.appendChild(hatImg);
    
    // Send hat data to server if it's the local agent
    if (container.id === 'local-hat') {
        socket.emit('updateHat', hatData);
    }
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
    
    // Add hat container
    const hatContainer = document.createElement('div');
    hatContainer.className = 'hat-container';
    hatContainer.id = `hat-${userData.id}`;
    
    // Apply hat if the user has one
    if (userData.hat) {
        applyHat(userData.hat, hatContainer);
    }
    
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
    remoteAgentContainer.appendChild(hatContainer);
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
            hatContainer,
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
        
        // Clear target agent
        targetAgent = null;
        
        // Set close speech bubble action
        const closeBubbleItem = contextMenu.querySelector('[data-action="close"]');
        const replyItem = contextMenu.querySelector('[data-action="reply"]');
        const speechBubble = document.getElementById('speech-bubble');
        
        // Hide mute/unmute options for local agent
        contextMenu.querySelector('[data-action="mute"]').style.display = 'none';
        contextMenu.querySelector('[data-action="unmute"]').style.display = 'none';
        
        // Check if speech bubble is visible for close option
        if (speechBubble.style.display === 'block' || speechBubble.style.display === '') {
            closeBubbleItem.classList.remove('disabled');
        } else {
            closeBubbleItem.classList.add('disabled');
        }
        
        // Check if we have our own last message for reply option
        if (lastMessages.has(socket.id)) {
            replyItem.classList.remove('disabled');
        } else {
            replyItem.classList.add('disabled');
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
        targetAgent = agentId;
        
        // Configure menu items
        const closeBubbleItem = contextMenu.querySelector('[data-action="close"]');
        const replyItem = contextMenu.querySelector('[data-action="reply"]');
        const muteItem = contextMenu.querySelector('[data-action="mute"]');
        const unmuteItem = contextMenu.querySelector('[data-action="unmute"]');
        const kickItem = contextMenu.querySelector('[data-action="kick"]');
        const banItem = contextMenu.querySelector('[data-action="ban"]');
        
        const speechBubble = document.getElementById(`speech-${agentId}`);
        const isMuted = mutedAgents.has(agentId);
        
        // Enable/disable close bubble option
        if (speechBubble.style.display === 'block' || speechBubble.style.display === '') {
            closeBubbleItem.classList.remove('disabled');
        } else {
            closeBubbleItem.classList.add('disabled');
        }
        
        // Enable/disable reply option
        if (lastMessages.has(agentId)) {
            replyItem.classList.remove('disabled');
        } else {
            replyItem.classList.add('disabled');
        }
        
        // Show appropriate mute/unmute option
        if (isMuted) {
            muteItem.style.display = 'none';
            unmuteItem.style.display = 'block';
        } else {
            muteItem.style.display = 'block';
            unmuteItem.style.display = 'none';
        }
        
        // Show/hide admin options
        if (isAdmin) {
            kickItem.style.display = 'block';
            banItem.style.display = 'block';
        } else {
            kickItem.style.display = 'none';
            banItem.style.display = 'none';
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
        
        if (action === 'close') {
            // Close speech bubble
            if (targetAgent) {
                const speechBubble = document.getElementById(`speech-${targetAgent}`);
                speechBubble.style.display = 'none';
            } else {
                const speechBubble = document.getElementById('speech-bubble');
                speechBubble.style.display = 'none';
                if (speechBubbleTimeout) {
                    clearTimeout(speechBubbleTimeout);
                }
            }
        } else if (action === 'reply') {
            // Reply to message
            const id = targetAgent || socket.id;
            if (lastMessages.has(id)) {
                const message = lastMessages.get(id);
                replyingTo = {
                    id,
                    nickname: message.nickname,
                    message: message.text
                };
                
                // Show reply indicator in the input
                const input = document.getElementById('message-input');
                input.placeholder = `Replying to ${replyingTo.nickname}...`;
                input.focus();
            }
        } else if (action === 'hat') {
            // Open hat maker
            openHatMaker();
        } else if (action === 'mute') {
            // Mute agent
            if (targetAgent) {
                mutedAgents.add(targetAgent);
                remoteAgents.get(targetAgent).muted = true;
            }
        } else if (action === 'unmute') {
            // Unmute agent
            if (targetAgent) {
                mutedAgents.delete(targetAgent);
                remoteAgents.get(targetAgent).muted = false;
            }
        } else if (action === 'kick' && isAdmin) {
            // Kick user
            if (targetAgent) {
                socket.emit('adminAction', {
                    action: 'kick',
                    targetId: targetAgent,
                    reason: 'Kicked by admin'
                });
            }
        } else if (action === 'ban' && isAdmin) {
            // Show ban window
            if (targetAgent) {
                openBanWindow(targetAgent);
            }
        }
        
        contextMenu.style.display = 'none';
    }
});

// Open hat maker window
function openHatMaker() {
    const hatMakerWindow = document.getElementById('hat-maker-window');
    hatMakerWindow.style.display = 'block';
    
    // If we have a current hat, set the form values
    if (currentHat) {
        // Find the right radio button
        const hatType = currentHat.type;
        const radioBtn = document.getElementById(`hat-${hatType}`);
        if (radioBtn) {
            radioBtn.checked = true;
        }
        
        // Set size and position
        document.getElementById('hat-size').value = currentHat.size;
        document.getElementById('hat-size-value').textContent = currentHat.size.toFixed(1);
        document.getElementById('hat-x').value = currentHat.x;
        document.getElementById('hat-y').value = currentHat.y;
    } else {
        // Default selection
        document.getElementById('hat-top_hat').checked = true;
        document.getElementById('hat-size').value = 1;
        document.getElementById('hat-size-value').textContent = '1.0';
        document.getElementById('hat-x').value = 0;
        document.getElementById('hat-y').value = -50;
    }
}

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
        } else if (hatDragging) {
            // Handle hat dragging
            const hatContainer = document.getElementById('local-hat');
            const hatX = document.getElementById('hat-x');
            const hatY = document.getElementById('hat-y');
            
            // Update coordinates based on drag movement
            const x = parseInt(hatX.value) + e.movementX;
            const y = parseInt(hatY.value) + e.movementY;
            
            // Update inputs
            hatX.value = x;
            hatY.value = y;
            
            // Update hat position
            if (hatContainer.querySelector('img')) {
                hatContainer.querySelector('img').style.left = x + 'px';
                hatContainer.querySelector('img').style.top = y + 'px';
            }
        }
    });
    
    document.addEventListener('mouseup', () => {
        isDragging = false;
        hatDragging = false;
        agentContainer.style.zIndex = '20';
        
        // Remove draggable class from hat container
        const hatContainer = document.getElementById('local-hat');
        hatContainer.classList.remove('draggable');
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
            // Linkify the message
            const linkedMessage = linkify(message);
            
            // Check if we're replying to a message
            if (replyingTo) {
                socket.emit('chatMessage', { 
                    message, 
                    replyTo: {
                        id: replyingTo.id,
                        nickname: replyingTo.nickname,
                        message: replyingTo.message
                    },
                    isHtml: true
                });
                
                // Show speech bubble with quote for ourselves
                const quoteHtml = `<div class="quote">${replyingTo.nickname}: ${replyingTo.message}</div>${linkedMessage}`;
                showSpeechBubbleHtml('speech-bubble', quoteHtml);
                
                // Reset reply state
                replyingTo = null;
                input.placeholder = 'Type your message...';
            } else {
                socket.emit('chatMessage', { message, isHtml: true });
                showSpeechBubbleHtml('speech-bubble', linkedMessage);
            }
            
            // Store our message
            lastMessages.set(socket.id, {
                nickname: nickname,
                text: message
            });
        }
        input.value = '';
        hideStatusIndicators();
        socket.emit('typingStatus', { isTyping: false, isCommanding: false });
    }
}

// Show speech bubble with auto-close
function showSpeechBubble(bubbleId, message) {
    const speechBubble = document.getElementById(bubbleId);
    speechBubble.innerHTML = message;
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

// Show speech bubble with HTML content
function showSpeechBubbleHtml(bubbleId, html) {
    const speechBubble = document.getElementById(bubbleId);
    speechBubble.innerHTML = html;
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
        case 'adminpass':
            if (parts[1] === ADMIN_PASSWORD) {
                isAdmin = true;
                nickname = ADMIN_NAME;
                socket.emit('login', { 
                    nickname, 
                    room: currentRoom, 
                    agent: currentAgent,
                    isAdmin: true
                });
                document.querySelector('.nametag-text').textContent = nickname;
                appendSystemMessage("You are now an admin.");
            } else {
                appendSystemMessage("Incorrect admin password.");
            }
            break;
        case 'image':
            const imageUrl = parts.slice(1).join(' ');
            if (imageUrl && imageUrl.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i)) {
                socket.emit('chatMessage', { 
                    message: createImageEmbed(imageUrl), 
                    isHtml: true 
                });
                showSpeechBubbleHtml('speech-bubble', createImageEmbed(imageUrl));
            } else {
                appendSystemMessage("Invalid image URL. Please use a direct link to an image file.");
            }
            break;
        case 'youtube':
            const videoUrl = parts.slice(1).join(' ');
            if (videoUrl && videoUrl.match(/^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/).+$/i)) {
                socket.emit('chatMessage', { 
                    message: createVideoEmbed(videoUrl), 
                    isHtml: true 
                });
                showSpeechBubbleHtml('speech-bubble', createVideoEmbed(videoUrl));
            } else {
                appendSystemMessage("Invalid video URL. Please use a YouTube link.");
            }
            break;
        case 'poll':
            if (parts.length < 2) {
                appendSystemMessage("Usage: /poll [question]");
                return;
            }
            const question = parts.slice(1).join(' ');
            socket.emit('createPoll', { question });
            break;
        case 'kick':
            if (isAdmin && parts.length >= 2) {
                const targetNickname = parts.slice(1).join(' ');
                socket.emit('adminAction', {
                    action: 'kickByName',
                    targetName: targetNickname,
                    reason: 'Kicked by admin'
                });
            } else if (!isAdmin) {
                appendSystemMessage("You need to be an admin to use this command.");
            }
            break;
        case 'ban':
            if (isAdmin && parts.length >= 2) {
                const targetNickname = parts.slice(1).join(' ');
                socket.emit('adminAction', {
                    action: 'banByName',
                    targetName: targetNickname,
                    reason: 'Banned by admin'
                });
            } else if (!isAdmin) {
                appendSystemMessage("You need to be an admin to use this command.");
            }
            break;
        case 'announce':
            if (isAdmin && parts.length >= 2) {
                const announcement = parts.slice(1).join(' ');
                socket.emit('adminAction', {
                    action: 'announce',
                    message: announcement
                });
            } else if (!isAdmin) {
                appendSystemMessage("You need to be an admin to use this command.");
            }
            break;
        case 'mute':
            if (isAdmin && parts.length >= 2) {
                const targetNickname = parts.slice(1).join(' ');
                socket.emit('adminAction', {
                    action: 'muteByName',
                    targetName: targetNickname
                });
            } else if (!isAdmin) {
                appendSystemMessage("You need to be an admin to use this command.");
            }
            break;
        case 'unmute':
            if (isAdmin && parts.length >= 2) {
                const targetNickname = parts.slice(1).join(' ');
                socket.emit('adminAction', {
                    action: 'unmuteByName',
                    targetName: targetNickname
                });
            } else if (!isAdmin) {
                appendSystemMessage("You need to be an admin to use this command.");
            }
            break;
        case 'clear':
            if (isAdmin) {
                socket.emit('adminAction', {
                    action: 'clearChat'
                });
            } else {
                appendSystemMessage("You need to be an admin to use this command.");
            }
            break;
        case 'help':
            showHelpWindow();
            break;
    }
}

// Show help window
function showHelpWindow() {
    window.open('readme.html', '_blank', 'width=550,height=650');
}

// Socket event handlers
socket.on('message', (data) => {
    const chatContainer = document.getElementById('chat-container');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    
    // Add admin class if applicable
    if (data.isAdmin) {
        messageDiv.classList.add('admin');
    }
    
    // Store the message for potential replies
    lastMessages.set(data.id, {
        nickname: data.nickname,
        text: data.message
    });
    
    // Check if it's a reply
    if (data.replyTo) {
        // Format with quote for the chat window
        const linkedMessage = data.isHtml ? data.message : linkify(data.message);
        messageDiv.innerHTML = `<div class="quote">${data.replyTo.nickname}: ${data.replyTo.message}</div>${data.nickname}: ${linkedMessage}`;
    } else {
        // Regular message with linkified content
        const linkedMessage = data.isHtml ? data.message : linkify(data.message);
        messageDiv.innerHTML = `${data.nickname}: ${linkedMessage}`;
    }
    
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    // If message is from another user, show their speech bubble
    if (data.id !== socket.id && remoteAgents.has(data.id)) {
        const remoteAgent = remoteAgents.get(data.id);
        
        // Check if agent is muted
        if (!remoteAgent.muted) {
            if (data.replyTo) {
                // Show speech bubble with quote
                const linkedMessage = data.isHtml ? data.message : linkify(data.message);
                const quoteHtml = `<div class="quote">${data.replyTo.nickname}: ${data.replyTo.message}</div>${linkedMessage}`;
                showSpeechBubbleHtml(`speech-${data.id}`, quoteHtml);
            } else {
                const linkedMessage = data.isHtml ? data.message : linkify(data.message);
                showSpeechBubbleHtml(`speech-${data.id}`, linkedMessage);
            }
            
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
        lastMessages.delete(data.id);
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
            },
            hat: data.hat
        });
    }
});

socket.on('hatUpdated', (data) => {
    if (remoteAgents.has(data.id)) {
        const hatContainer = document.getElementById(`hat-${data.id}`);
        if (hatContainer) {
            applyHat(data.hat, hatContainer);
        }
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

// Replace window open and initialization 
// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    
    // Show login window
    document.getElementById('login-window').style.display = 'block';
    
    // Set initial agent type
    document.querySelectorAll('input[name="agent-type"]').forEach(radio => {
        radio.addEventListener('change', function() {
            currentAgent = this.value;
        });
    });
    
    // Set default agent
    document.getElementById('agent-clippy').checked = true;
    
    // Initialize all hat-related functionality
    initializeHatFunctionality();
    
    // Initialize poll window
    createPollWindow();
}); 

// Add a function to initialize all hat-related event listeners
function initializeHatFunctionality() {
    // Hat size slider
    const hatSize = document.getElementById('hat-size');
    if (hatSize) {
        hatSize.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            const sizeValueEl = document.getElementById('hat-size-value');
            if (sizeValueEl) {
                sizeValueEl.textContent = value.toFixed(1);
            }
            // Update preview
            previewHat();
        });
    }
    
    // Hat position inputs
    const hatX = document.getElementById('hat-x');
    if (hatX) {
        hatX.addEventListener('input', previewHat);
    }
    
    const hatY = document.getElementById('hat-y');
    if (hatY) {
        hatY.addEventListener('input', previewHat);
    }
    
    // Hat type radio buttons
    const hatTypeRadios = document.querySelectorAll('input[name="hat-type"]');
    if (hatTypeRadios.length > 0) {
        hatTypeRadios.forEach(radio => {
            radio.addEventListener('change', previewHat);
        });
    }
    
    // Custom URL input
    const customHatUrl = document.getElementById('custom-hat-url');
    if (customHatUrl) {
        customHatUrl.addEventListener('input', () => {
            // Select custom radio when typing URL
            const hatCustom = document.getElementById('hat-custom');
            if (hatCustom) {
                hatCustom.checked = true;
            }
            previewHat();
        });
    }
    
    // Allow dragging the hat to position it
    const localHat = document.getElementById('local-hat');
    if (localHat) {
        localHat.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'IMG') {
                e.stopPropagation();
                hatDragging = true;
            }
        });
    }
    
    // Apply hat button
    const applyHatBtn = document.getElementById('apply-hat-btn');
    if (applyHatBtn) {
        applyHatBtn.addEventListener('click', () => {
            const selectedRadio = document.querySelector('input[name="hat-type"]:checked');
            const hatType = selectedRadio ? selectedRadio.value : null;
            
            // Check if hatType is defined
            if (!hatType) {
                alert('Please select a hat type');
                return;
            }
            
            const url = hatImages[hatType];
            
            if (!url) {
                alert('Please select a valid hat');
                return;
            }
            
            const hatSizeEl = document.getElementById('hat-size');
            const hatXEl = document.getElementById('hat-x');
            const hatYEl = document.getElementById('hat-y');
            
            if (!hatSizeEl || !hatXEl || !hatYEl) {
                alert('Error: Missing hat configuration elements');
                return;
            }
            
            const size = parseFloat(hatSizeEl.value) || 1.0;
            const x = parseInt(hatXEl.value) || 0;
            const y = parseInt(hatYEl.value) || 0;
            
            // Save current hat data
            currentHat = {
                type: hatType,
                url,
                size,
                x,
                y
            };
            
            // Apply hat to local agent
            const localHat = document.getElementById('local-hat');
            if (localHat) {
                applyHat(currentHat, localHat);
            }
            
            // Close window
            const hatMakerWindow = document.getElementById('hat-maker-window');
            if (hatMakerWindow) {
                hatMakerWindow.style.display = 'none';
            }
        });
    }
    
    // Remove hat button
    const removeHatBtn = document.getElementById('remove-hat-btn');
    if (removeHatBtn) {
        removeHatBtn.addEventListener('click', () => {
            // Clear hat
            const localHat = document.getElementById('local-hat');
            if (localHat) {
                localHat.innerHTML = '';
            }
            currentHat = null;
            
            // Tell server to remove hat
            socket.emit('updateHat', null);
            
            // Close window
            const hatMakerWindow = document.getElementById('hat-maker-window');
            if (hatMakerWindow) {
                hatMakerWindow.style.display = 'none';
            }
        });
    }
    
    // Cancel button
    const cancelHatBtn = document.getElementById('cancel-hat-btn');
    if (cancelHatBtn) {
        cancelHatBtn.addEventListener('click', () => {
            const localHat = document.getElementById('local-hat');
            if (!localHat) return;
            
            // Restore original hat
            if (currentHat) {
                applyHat(currentHat, localHat);
            } else {
                localHat.innerHTML = '';
            }
            
            // Close window
            const hatMakerWindow = document.getElementById('hat-maker-window');
            if (hatMakerWindow) {
                hatMakerWindow.style.display = 'none';
            }
        });
    }
    
    // Hat maker taskbar button
    const hatMakerBtn = document.getElementById('hat-maker-btn');
    if (hatMakerBtn) {
        hatMakerBtn.addEventListener('click', openHatMaker);
    }
}

// Preview hat
function previewHat() {
    const selectedRadio = document.querySelector('input[name="hat-type"]:checked');
    const hatType = selectedRadio ? selectedRadio.value : null;
    
    // Check if a hat type is selected
    if (!hatType) return;
    
    const url = hatImages[hatType];
    
    if (!url) return;
    
    const size = parseFloat(document.getElementById('hat-size').value) || 1.0;
    const x = parseInt(document.getElementById('hat-x').value) || 0;
    const y = parseInt(document.getElementById('hat-y').value) || 0;
    
    // Update local hat preview
    const hatContainer = document.getElementById('local-hat');
    hatContainer.innerHTML = '';
    
    const hatImg = document.createElement('img');
    hatImg.src = url;
    hatImg.style.width = (size * 100) + 'px';
    hatImg.style.left = x + 'px';
    hatImg.style.top = y + 'px';
    
    hatContainer.appendChild(hatImg);
    
    // Make hat draggable during preview
    hatContainer.classList.add('draggable');
}

// Taskbar button functionality
document.getElementById('chat-taskbar-btn').addEventListener('click', () => {
    const chatScreen = document.getElementById('chat-screen');
    if (chatScreen.style.display === 'none') {
        chatScreen.style.display = 'block';
    } else {
        chatScreen.style.display = 'none';
    }
});

// Hat maker button
document.getElementById('hat-maker-btn').addEventListener('click', () => {
    openHatMaker();
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

// Linkify function to convert URLs to clickable links
function linkify(text) {
    // URL regex pattern
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, function(url) {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
}

// Function to open ban window
function openBanWindow(userId) {
    // Create ban window if it doesn't exist
    if (!document.getElementById('ban-window')) {
        const banWindow = document.createElement('div');
        banWindow.id = 'ban-window';
        banWindow.className = 'window';
        banWindow.innerHTML = `
            <div class="title-bar">
                <div class="title-bar-text">Ban User</div>
                <div class="title-bar-controls">
                    <button aria-label="Close"></button>
                </div>
            </div>
            <div class="window-body">
                <div class="field-row">
                    <label for="ban-reason">Reason:</label>
                    <input id="ban-reason" type="text" maxlength="100">
                </div>
                <div class="field-row buttons">
                    <button id="confirm-ban-btn">Ban</button>
                    <button id="cancel-ban-btn">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(banWindow);
        
        // Position window
        banWindow.style.top = '50%';
        banWindow.style.left = '50%';
        banWindow.style.transform = 'translate(-50%, -50%)';
        banWindow.style.width = '300px';
        banWindow.style.zIndex = '200';
        
        // Add event listeners
        document.getElementById('confirm-ban-btn').addEventListener('click', () => {
            const reason = document.getElementById('ban-reason').value.trim() || 'Banned by admin';
            socket.emit('adminAction', {
                action: 'ban',
                targetId: banWindow.dataset.userId,
                reason
            });
            banWindow.style.display = 'none';
        });
        
        document.getElementById('cancel-ban-btn').addEventListener('click', () => {
            banWindow.style.display = 'none';
        });
        
        // Handle close button
        banWindow.querySelector('.title-bar-controls button').addEventListener('click', () => {
            banWindow.style.display = 'none';
        });
    }
    
    // Set the target user ID and show window
    const banWindow = document.getElementById('ban-window');
    banWindow.dataset.userId = userId;
    document.getElementById('ban-reason').value = '';
    banWindow.style.display = 'block';
}

// Add admin action handlers
socket.on('adminAction', (data) => {
    if (data.action === 'kick' && data.targetId === socket.id) {
        appendSystemMessage(`You have been kicked: ${data.reason}`);
        socket.disconnect();
        alert(`You have been kicked: ${data.reason}`);
    } else if (data.action === 'ban' && data.targetId === socket.id) {
        appendSystemMessage(`You have been banned: ${data.reason}`);
        socket.disconnect();
        alert(`You have been banned: ${data.reason}`);
    } else if (data.action === 'deviceInfo' && data.targetId === socket.id) {
        // The user is being asked for device info
        appendSystemMessage("An admin has requested your device information.");
    }
});

// Add device info
socket.on('connect', () => {
    // Collect basic device info for admin purposes
    const deviceInfo = {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        screenSize: `${window.screen.width}x${window.screen.height}`,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
    
    // Store this info with the connection
    socket.emit('deviceInfo', deviceInfo);
});

// Admin info received
socket.on('userInfo', (data) => {
    if (isAdmin) {
        const infoWindow = document.createElement('div');
        infoWindow.className = 'window';
        infoWindow.style.top = '100px';
        infoWindow.style.left = '100px';
        infoWindow.style.zIndex = '200';
        infoWindow.style.width = '400px';
        
        let infoHtml = `
            <div class="title-bar">
                <div class="title-bar-text">User Info: ${data.nickname}</div>
                <div class="title-bar-controls">
                    <button aria-label="Close"></button>
                </div>
            </div>
            <div class="window-body">
                <div class="field-row"><b>User ID:</b> ${data.id}</div>
                <div class="field-row"><b>Device:</b> ${data.deviceInfo.platform}</div>
                <div class="field-row"><b>Browser:</b> ${data.deviceInfo.userAgent}</div>
                <div class="field-row"><b>Screen:</b> ${data.deviceInfo.screenSize}</div>
                <div class="field-row"><b>Language:</b> ${data.deviceInfo.language}</div>
                <div class="field-row"><b>Timezone:</b> ${data.deviceInfo.timezone}</div>
            </div>
        `;
        
        infoWindow.innerHTML = infoHtml;
        document.body.appendChild(infoWindow);
        
        // Close button
        infoWindow.querySelector('.title-bar-controls button').addEventListener('click', () => {
            infoWindow.remove();
        });
    }
});

// Additional socket event handlers for polls
socket.on('pollCreated', (pollData) => {
    appendSystemMessage(`New poll: ${pollData.question}`);
    updatePollDisplay(pollData);
});

socket.on('pollUpdated', (pollData) => {
    updatePollDisplay(pollData);
});

socket.on('pollClosed', (pollData) => {
    // Final poll results
    appendSystemMessage(`Poll closed: "${pollData.question}" - Yes: ${pollData.votes.yes}, No: ${pollData.votes.no}`);
    
    // Clear active poll
    setTimeout(() => {
        activePoll = null;
        const pollWindow = document.getElementById('poll-window');
        if (pollWindow) {
            pollWindow.style.display = 'none';
        }
    }, 5000);
});

// Admin announcement
socket.on('announcement', (data) => {
    const chatContainer = document.getElementById('chat-container');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message announcement';
    messageDiv.innerHTML = `<b>ANNOUNCEMENT:</b> ${data.message}`;
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
});

// Clear chat
socket.on('clearChat', () => {
    const chatContainer = document.getElementById('chat-container');
    chatContainer.innerHTML = '';
    appendSystemMessage("Chat has been cleared by an admin");
});

// Add poll window HTML
function createPollWindow() {
    if (document.getElementById('poll-window')) return;
    
    const pollWindow = document.createElement('div');
    pollWindow.id = 'poll-window';
    pollWindow.className = 'window';
    pollWindow.innerHTML = `
        <div class="title-bar">
            <div class="title-bar-text">Poll</div>
            <div class="title-bar-controls">
                <button aria-label="Minimize"></button>
                <button aria-label="Close"></button>
            </div>
        </div>
        <div class="window-body">
            <h4 id="poll-question">No active poll</h4>
            <div class="poll-options">
                <div class="poll-option">
                    <div class="field-row">
                        <input id="poll-yes" type="radio" name="poll-answer" value="yes">
                        <label for="poll-yes">Yes</label>
                    </div>
                    <div class="progress-bar">
                        <div id="yes-progress" class="progress yes" style="width: 0%"></div>
                    </div>
                    <div id="yes-count" class="vote-count">0</div>
                </div>
                <div class="poll-option">
                    <div class="field-row">
                        <input id="poll-no" type="radio" name="poll-answer" value="no">
                        <label for="poll-no">No</label>
                    </div>
                    <div class="progress-bar">
                        <div id="no-progress" class="progress no" style="width: 0%"></div>
                    </div>
                    <div id="no-count" class="vote-count">0</div>
                </div>
            </div>
            <div id="poll-voters" class="poll-voters">
                <small>Voters: <span id="voter-count">0</span></small>
            </div>
            <div class="field-row buttons">
                <button id="vote-btn" disabled>Vote</button>
                <button id="poll-close-btn" style="display: none;">Close Poll</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(pollWindow);
    
    // Position the window
    pollWindow.style.top = '50%';
    pollWindow.style.left = '50%';
    pollWindow.style.transform = 'translate(-50%, -50%)';
    pollWindow.style.display = 'none';
    pollWindow.style.zIndex = '100';
    
    // Window control handlers
    pollWindow.querySelector('button[aria-label="Close"]').addEventListener('click', () => {
        pollWindow.style.display = 'none';
    });
    
    pollWindow.querySelector('button[aria-label="Minimize"]').addEventListener('click', () => {
        pollWindow.style.display = 'none';
    });
    
    // Vote button handler
    document.getElementById('vote-btn').addEventListener('click', () => {
        const selectedOption = document.querySelector('input[name="poll-answer"]:checked');
        if (selectedOption && activePoll) {
            socket.emit('votePoll', {
                pollId: activePoll.id,
                vote: selectedOption.value
            });
            
            // Disable voting UI after vote
            document.getElementById('poll-yes').disabled = true;
            document.getElementById('poll-no').disabled = true;
            document.getElementById('vote-btn').disabled = true;
        }
    });
    
    // Close poll button (admin only)
    document.getElementById('poll-close-btn').addEventListener('click', () => {
        if (isAdmin && activePoll) {
            socket.emit('adminAction', {
                action: 'closePoll',
                pollId: activePoll.id
            });
        }
    });
    
    // Enable vote button when an option is selected
    document.querySelectorAll('input[name="poll-answer"]').forEach(radio => {
        radio.addEventListener('change', () => {
            document.getElementById('vote-btn').disabled = false;
        });
    });
    
    // Make window draggable
    makeDraggable(pollWindow);
}

// Function to update poll display
function updatePollDisplay(poll) {
    activePoll = poll;
    
    const pollWindow = document.getElementById('poll-window');
    if (!pollWindow) {
        createPollWindow();
    }
    
    if (!poll) {
        pollWindow.style.display = 'none';
        return;
    }
    
    // Update poll data
    document.getElementById('poll-question').textContent = poll.question;
    
    const totalVotes = poll.votes.yes + poll.votes.no;
    const yesPercent = totalVotes === 0 ? 0 : Math.round((poll.votes.yes / totalVotes) * 100);
    const noPercent = totalVotes === 0 ? 0 : Math.round((poll.votes.no / totalVotes) * 100);
    
    document.getElementById('yes-progress').style.width = yesPercent + '%';
    document.getElementById('no-progress').style.width = noPercent + '%';
    document.getElementById('yes-count').textContent = poll.votes.yes;
    document.getElementById('no-count').textContent = poll.votes.no;
    document.getElementById('voter-count').textContent = totalVotes;
    
    // Reset vote options
    document.getElementById('poll-yes').disabled = poll.hasVoted;
    document.getElementById('poll-no').disabled = poll.hasVoted;
    document.getElementById('vote-btn').disabled = poll.hasVoted;
    
    // Show close button for admin
    document.getElementById('poll-close-btn').style.display = isAdmin ? 'block' : 'none';
    
    // Show window
    pollWindow.style.display = 'block';
}

// Helper function to make any window draggable
function makeDraggable(window) {
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
            window.style.transform = 'none'; // Remove translate transform
        }
    });
    
    document.addEventListener('mouseup', () => {
        isDragging = false;
    });
}

// Helper function to create image in speech bubble
function createImageEmbed(url) {
    return `<div class="media-embed"><img src="${url}" alt="User image" class="embedded-image"></div>`;
}

// Helper function to create video embed
function createVideoEmbed(url) {
    let videoId = '';
    
    // Extract YouTube video ID
    if (url.includes('youtube.com/watch?v=')) {
        videoId = url.split('v=')[1].split('&')[0];
    } else if (url.includes('youtu.be/')) {
        videoId = url.split('youtu.be/')[1].split('?')[0];
    }
    
    if (videoId) {
        return `<div class="media-embed">
            <iframe width="280" height="157" 
                src="https://www.youtube.com/embed/${videoId}" 
                frameborder="0" allowfullscreen></iframe>
        </div>`;
    } else {
        return `<div class="media-embed"><a href="${url}" target="_blank">${url}</a></div>`;
    }
} 
