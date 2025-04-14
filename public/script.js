const socket = io();
let currentAgent = 'clippy';
let stage;
let agentSprite;
let nickname = '';
let currentRoom = 'default';
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
        image: 'https://raw.githubusercontent.com/Rafafrias2012/BonziWORLD-V7.8.0/refs/heads/main/client/img/agents/purple.png'
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
    document.querySelector('.agent-nametag').textContent = nickname;
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
        socket.emit('login', { nickname, room: currentRoom });
        document.getElementById('login-window').style.display = 'none';
        document.getElementById('chat-screen').style.display = 'block';
        document.getElementById('room-id').textContent = currentRoom;
        initAgent();
    }
});

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
        }
        input.value = '';
    }
}

function handleCommand(command) {
    const parts = command.slice(1).split(' ');
    switch (parts[0]) {
        case 'name':
            if (parts[1]) {
                nickname = parts[1];
                socket.emit('login', { nickname, room: currentRoom });
                document.querySelector('.agent-nametag').textContent = nickname;
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
    
    // Show speech bubble
    const speechBubble = document.getElementById('speech-bubble');
    speechBubble.textContent = data.message;
    speechBubble.style.display = 'block';
    setTimeout(() => {
        speechBubble.style.display = 'none';
    }, 3000);
    
    // Text-to-speech
    speak.play(data.message);
});

socket.on('userJoined', (data) => {
    appendSystemMessage(`${data.nickname} joined the chat`);
});

socket.on('userLeft', (nickname) => {
    appendSystemMessage(`${nickname} left the chat`);
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
