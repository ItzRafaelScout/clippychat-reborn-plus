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
const userRooms = new Map();
// Store banned users by IP
const bannedIPs = new Set();
// Store device info
const deviceInfoMap = new Map();

// Store active polls and user data
const activeChatPolls = new Map();
const activePolls = new Map();
const mutedUsers = new Set();

io.on('connection', (socket) => {
    console.log('A user connected');
    
    // Store client IP
    const clientIP = socket.handshake.headers['x-forwarded-for'] || 
                     socket.handshake.address;
    
    // Check if IP is banned
    if (bannedIPs.has(clientIP)) {
        socket.emit('adminAction', {
            action: 'ban',
            targetId: socket.id,
            reason: 'Your IP address is banned'
        });
        socket.disconnect();
        return;
    }

    // Store device info
    socket.on('deviceInfo', (info) => {
        deviceInfoMap.set(socket.id, info);
    });

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
                        position: user.position,
                        hat: user.hat
                    });
                }
            });

            // Generate random position for new user
            const position = {
                x: Math.floor(Math.random() * 800) + 50,
                y: Math.floor(Math.random() * 400) + 50
            };

            // Get current user data if exists (for updating)
            const currentUser = users.get(socket.id);
            
            // Store user data
            users.set(socket.id, {
                nickname: data.nickname,
                room: data.room || 'default',
                agent: data.agent || 'clippy',
                position,
                isTyping: false,
                isCommanding: false,
                hat: currentUser ? currentUser.hat : null,
                isAdmin: data.isAdmin || false,
                ip: clientIP
            });

            // Join the room
            socket.join(data.room || 'default');
            
            // Inform others about the new user
            socket.to(data.room || 'default').emit('userJoined', {
                id: socket.id,
                nickname: data.nickname,
                agent: data.agent || 'clippy',
                position,
                hat: currentUser ? currentUser.hat : null,
                isAdmin: data.isAdmin || false
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

    socket.on('updateHat', (hatData) => {
        const user = users.get(socket.id);
        if (user) {
            user.hat = hatData;
            socket.to(user.room).emit('hatUpdated', {
                id: socket.id,
                hat: hatData
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
        const user = users.get(socket.id);
        const room = userRooms.get(socket.id);
        
        if (!user || !room) return;
        
        // Check if user is muted
        if (mutedUsers.has(socket.id)) {
            socket.emit('systemMessage', 'You cannot send messages because you are muted');
            return;
        }
        
        // Process message with HTML or without
        const messageData = {
            id: Date.now(),
            from: user.nickname,
            agent: user.agent,
            isAdmin: user.isAdmin,
            message: data.isHtml ? data.message : sanitizeHTML(data.message)
        };
        
        // Add reply data if present
        if (data.replyTo) {
            messageData.replyTo = data.replyTo;
        }
        
        io.to(room).emit('chatMessage', messageData);
    });

    socket.on('changeAgent', (newAgent) => {
        if (agents.includes(newAgent)) {
            const user = users.get(socket.id);
            if (user) {
                user.agent = newAgent;
                socket.to(user.room).emit('agentChanged', {
                    id: socket.id,
                    nickname: user.nickname,
                    agent: newAgent,
                    hat: user.hat,
                    isAdmin: user.isAdmin
                });
            }
        }
    });
    
    // Admin actions
    socket.on('adminAction', (data) => {
        const user = users.get(socket.id);
        const room = userRooms.get(socket.id);
        
        // Only allow admin actions from admins
        if (!user || !user.isAdmin) {
            socket.emit('systemMessage', 'You need to be an admin to perform this action');
            return;
        }
        
        switch (data.action) {
            case 'kickByName':
                // Find user with this name
                const targetId = findUserIdByName(data.targetName);
                if (targetId) {
                    const targetSocket = io.sockets.sockets.get(targetId);
                    if (targetSocket) {
                        targetSocket.emit('kicked', { reason: data.reason });
                        targetSocket.disconnect();
                        io.to(room).emit('systemMessage', `${data.targetName} was kicked by ${user.nickname}`);
                    }
                } else {
                    socket.emit('systemMessage', `User ${data.targetName} not found`);
                }
                break;
                
            case 'banByName':
                const targetId2 = findUserIdByName(data.targetName);
                if (targetId2) {
                    const targetSocket = io.sockets.sockets.get(targetId2);
                    if (targetSocket) {
                        const targetIP = targetSocket.handshake.address;
                        bannedIPs.add(targetIP);
                        targetSocket.emit('banned', { reason: data.reason });
                        targetSocket.disconnect();
                        io.to(room).emit('systemMessage', `${data.targetName} was banned by ${user.nickname}`);
                    }
                } else {
                    socket.emit('systemMessage', `User ${data.targetName} not found`);
                }
                break;
                
            case 'announce':
                io.emit('announcement', { message: data.message });
                break;
                
            case 'muteByName':
                const targetId3 = findUserIdByName(data.targetName);
                if (targetId3) {
                    mutedUsers.add(targetId3);
                    io.to(room).emit('systemMessage', `${data.targetName} was muted by ${user.nickname}`);
                    io.sockets.sockets.get(targetId3)?.emit('systemMessage', 'You have been muted by an admin');
                } else {
                    socket.emit('systemMessage', `User ${data.targetName} not found`);
                }
                break;
                
            case 'unmuteByName':
                const targetId4 = findUserIdByName(data.targetName);
                if (targetId4) {
                    mutedUsers.delete(targetId4);
                    io.to(room).emit('systemMessage', `${data.targetName} was unmuted by ${user.nickname}`);
                    io.sockets.sockets.get(targetId4)?.emit('systemMessage', 'You have been unmuted by an admin');
                } else {
                    socket.emit('systemMessage', `User ${data.targetName} not found`);
                }
                break;
                
            case 'clearChat':
                io.to(room).emit('clearChat');
                break;
                
            case 'closePoll':
                if (data.pollId && activePolls.has(data.pollId)) {
                    const poll = activePolls.get(data.pollId);
                    if (poll.room === room) {
                        // Close poll and send final results
                        io.to(room).emit('pollClosed', {
                            id: poll.id,
                            question: poll.question,
                            votes: poll.votes
                        });
                        
                        // Clean up
                        activeChatPolls.delete(room);
                        activePolls.delete(data.pollId);
                    }
                }
                break;
        }
    });

    // Create poll
    socket.on('createPoll', (data) => {
        const user = users.get(socket.id);
        const room = userRooms.get(socket.id);
        
        if (!user || !room) return;
        
        // Only allow one active poll per room
        if (activeChatPolls.has(room)) {
            socket.emit('systemMessage', 'There is already an active poll in this room');
            return;
        }
        
        const pollId = Date.now().toString();
        const poll = {
            id: pollId,
            creator: socket.id,
            question: data.question,
            votes: { yes: 0, no: 0 },
            voters: new Set(),
            room: room,
            timestamp: Date.now()
        };
        
        activeChatPolls.set(room, pollId);
        activePolls.set(pollId, poll);
        
        // Send poll data to all users in room
        io.to(room).emit('pollCreated', {
            id: poll.id,
            question: poll.question,
            votes: poll.votes,
            hasVoted: false
        });
    });
    
    // Vote on poll
    socket.on('votePoll', (data) => {
        const user = users.get(socket.id);
        const room = userRooms.get(socket.id);
        
        if (!user || !room) return;
        
        const activePollId = activeChatPolls.get(room);
        if (!activePollId || activePollId !== data.pollId) return;
        
        const poll = activePolls.get(data.pollId);
        if (!poll || poll.voters.has(socket.id)) return;
        
        // Record vote
        if (data.vote === 'yes' || data.vote === 'no') {
            poll.votes[data.vote]++;
            poll.voters.add(socket.id);
            
            // Update all clients
            io.to(room).emit('pollUpdated', {
                id: poll.id,
                question: poll.question,
                votes: poll.votes,
                hasVoted: false // Will be set to true client-side for those who voted
            });
            
            // Let voter know they voted
            socket.emit('pollUpdated', {
                id: poll.id,
                question: poll.question,
                votes: poll.votes,
                hasVoted: true
            });
        }
    });

    // Helper function to find user ID by nickname
    function findUserIdByName(nickname) {
        for (const [id, user] of users.entries()) {
            if (user.nickname.toLowerCase() === nickname.toLowerCase()) {
                return id;
            }
        }
        return null;
    }

    socket.on('disconnect', () => {
        const user = users.get(socket.id);
        if (user) {
            socket.to(user.room).emit('userLeft', {
                id: socket.id,
                nickname: user.nickname
            });
            users.delete(socket.id);
            deviceInfoMap.delete(socket.id);
        }
        
        // If user was in a poll, update counts
        const room = userRooms.get(socket.id);
        if (room && activeChatPolls.has(room)) {
            const pollId = activeChatPolls.get(room);
            const poll = activePolls.get(pollId);
            
            if (poll && poll.voters.has(socket.id)) {
                // Just leave their vote in place, no need to recalculate
                poll.voters.delete(socket.id);
            }
            
            // If poll creator left and no votes, clean up the poll
            if (poll && poll.creator === socket.id && poll.voters.size === 0) {
                activeChatPolls.delete(room);
                activePolls.delete(pollId);
                io.to(room).emit('systemMessage', 'Poll has been cancelled because the creator left');
            }
        }
        
        // Standard cleanup
        userRooms.delete(socket.id);
        mutedUsers.delete(socket.id);
    });
});

http.listen(3000, () => {
    console.log('Server running on port 3000');
}); 
