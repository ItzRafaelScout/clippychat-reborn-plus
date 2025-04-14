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
            users.set(socket.id, {
                nickname: data.nickname,
                room: data.room || 'default',
                agent: data.agent || 'clippy'
            });
            socket.join(data.room || 'default');
            io.to(data.room || 'default').emit('userJoined', {
                nickname: data.nickname,
                agent: data.agent || 'clippy'
            });
        }
    });

    socket.on('chatMessage', (data) => {
        if (data.message && data.message.length <= config.messageLimit) {
            const user = users.get(socket.id);
            if (user) {
                io.to(user.room).emit('message', {
                    nickname: user.nickname,
                    message: data.message,
                    agent: user.agent
                });
            }
        }
    });

    socket.on('changeAgent', (newAgent) => {
        if (agents.includes(newAgent)) {
            const user = users.get(socket.id);
            if (user) {
                user.agent = newAgent;
                io.to(user.room).emit('agentChanged', {
                    nickname: user.nickname,
                    agent: newAgent
                });
            }
        }
    });

    socket.on('disconnect', () => {
        const user = users.get(socket.id);
        if (user) {
            io.to(user.room).emit('userLeft', user.nickname);
            users.delete(socket.id);
        }
    });
});

http.listen(3000, () => {
    console.log('Server running on port 3000');
}); 
