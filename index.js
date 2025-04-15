const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');
const path = require('path');
const config = require('./config.json');

app.use(express.static('public'));
app.use(express.json());

// Load agents from agents.txt
const agents = fs.readFileSync('agents.txt', 'utf8').split('\n').filter(agent => agent.trim());

// Store active users
const users = new Map();

io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('login', (data) => {
        if (data.nickname && data.nickname.length <= config.nameLimit) {
            // Get current users in the room to send to the new user
            const roomUsers = [];
            users.forEach((user, id) => {
                if (user.room === (data.room || 'default') && id !== socket.id) {
                    roomUsers.push({
                        id,
                        nickname: user.nickname,
                        agent: user.agent,
                        position: user.position
                    });
                }
            });

            // Generate random position for new user
            const position = {
                x: Math.floor(Math.random() * 800) + 50,
                y: Math.floor(Math.random() * 400) + 50
            };

            // Store user data
            users.set(socket.id, {
                nickname: data.nickname,
                room: data.room || 'default',
                agent: data.agent || 'clippy',
                position,
                isTyping: false,
                isCommanding: false
            });

            // Join the room
            socket.join(data.room || 'default');
            
            // Inform others about the new user
            socket.to(data.room || 'default').emit('userJoined', {
                id: socket.id,
                nickname: data.nickname,
                agent: data.agent || 'clippy',
                position
            });

            // Send existing users to the new user
            socket.emit('currentUsers', roomUsers);
        }
    });

    socket.on('updatePosition', (position) => {
        const user = users.get(socket.id);
        if (user) {
            user.position = position;
            socket.to(user.room).emit('agentMoved', {
                id: socket.id,
                position
            });
        }
    });

    socket.on('typingStatus', (status) => {
        const user = users.get(socket.id);
        if (user) {
            user.isTyping = status.isTyping;
            user.isCommanding = status.isCommanding;
            socket.to(user.room).emit('typingStatus', {
                id: socket.id,
                isTyping: status.isTyping,
                isCommanding: status.isCommanding
            });
        }
    });

    socket.on('chatMessage', (data) => {
        if (data.message && data.message.length <= config.messageLimit) {
            const user = users.get(socket.id);
            if (user) {
                io.to(user.room).emit('message', {
                    id: socket.id,
                    nickname: user.nickname,
                    message: data.message,
                    agent: user.agent
                });
                
                // Reset typing status
                user.isTyping = false;
                user.isCommanding = false;
            }
        }
    });

    socket.on('changeAgent', (newAgent) => {
        if (agents.includes(newAgent)) {
            const user = users.get(socket.id);
            if (user) {
                user.agent = newAgent;
                socket.to(user.room).emit('agentChanged', {
                    id: socket.id,
                    nickname: user.nickname,
                    agent: newAgent
                });
            }
        }
    });

    socket.on('disconnect', () => {
        const user = users.get(socket.id);
        if (user) {
            socket.to(user.room).emit('userLeft', {
                id: socket.id,
                nickname: user.nickname
            });
            users.delete(socket.id);
        }
    });
});

http.listen(3000, () => {
    console.log('Server running on port 3000');
}); 
