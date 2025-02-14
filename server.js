const express = require('express');
const app = express();
const path = require('path');
const https = require('https');
const selfsigned = require('selfsigned');

// Generate self-signed certificate
const attrs = [{ name: 'commonName', value: 'localhost' }];
const pems = selfsigned.generate(attrs, {
    algorithm: 'sha256',
    days: 365,
    keySize: 2048,
    extensions: [{
        name: 'basicConstraints',
        cA: true
    }]
});

// Create HTTPS server
const server = https.createServer({
    key: pems.private,
    cert: pems.cert
}, app);

const io = require('socket.io')(server);

// Store active rooms and their users
const rooms = new Map();

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('join-room', (roomId) => {
        // Join the room
        socket.join(roomId);
        
        // Add user to room
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
        }
        rooms.get(roomId).add(socket.id);
        
        // Notify others in the room
        socket.to(roomId).emit('user-connected');
        
        console.log(`User ${socket.id} joined room ${roomId}`);
    });

    // Handle WebRTC signaling
    socket.on('offer', ({ offer, roomId }) => {
        console.log('Relaying offer');
        socket.to(roomId).emit('offer', { offer });
    });

    socket.on('answer', ({ answer, roomId }) => {
        console.log('Relaying answer');
        socket.to(roomId).emit('answer', { answer });
    });

    socket.on('ice-candidate', ({ candidate, roomId }) => {
        console.log('Relaying ICE candidate');
        socket.to(roomId).emit('ice-candidate', { candidate });
    });

    socket.on('leave-room', (roomId) => {
        // Remove user from room
        if (rooms.has(roomId)) {
            rooms.get(roomId).delete(socket.id);
            if (rooms.get(roomId).size === 0) {
                rooms.delete(roomId);
            }
        }
        
        socket.leave(roomId);
        console.log(`User ${socket.id} left room ${roomId}`);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Remove user from all rooms
        rooms.forEach((users, roomId) => {
            if (users.has(socket.id)) {
                users.delete(socket.id);
                if (users.size === 0) {
                    rooms.delete(roomId);
                }
            }
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`HTTPS Server running on https://localhost:${PORT}`);
});
