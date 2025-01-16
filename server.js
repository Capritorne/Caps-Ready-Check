const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

let players = {}; // Store players by lobbyId

app.use(express.static('public')); // Serve static files (HTML, CSS, JS)

io.on('connection', (socket) => {
    console.log('A user connected');

    // Handle joining a lobby
    socket.on('joinLobby', ({ playerName, lobbyId }) => {
        console.log(`${playerName} joined the lobby: ${lobbyId}`);
        
        // Ensure player joins the correct room (lobby)
        socket.join(lobbyId);

        // If the lobby doesn't exist, create it
        if (!players[lobbyId]) {
            players[lobbyId] = [];
        }

        // Check for duplicate player name in the lobby
        const isDuplicate = players[lobbyId].some(player => player.name === playerName);
        if (isDuplicate) {
            socket.emit('joinError', { message: 'A player with this name is already in the lobby.' });
            return;
        }

        // Add player to the lobby
        players[lobbyId].push({ name: playerName, isReady: false, socketId: socket.id });

        // Emit the updated players list to everyone in the lobby
        io.to(lobbyId).emit('playersUpdate', players[lobbyId]);
    });

    // Handle ready/unready toggle
    socket.on('toggleReady', ({ playerName, lobbyId, isReady }) => {
        console.log(`${playerName} toggled ready status to ${isReady ? 'Ready' : 'Not Ready'}`);
        const player = players[lobbyId].find(p => p.name === playerName);
        if (player) {
            player.isReady = isReady;
            io.to(lobbyId).emit('playersUpdate', players[lobbyId]); // Update only this lobby
            
            // Check if all players in the lobby are ready
            const allReady = players[lobbyId].every(p => p.isReady);
            if (allReady) {
                // If everyone is ready, trigger the "Everyone is Ready" notification
                io.to(lobbyId).emit('everyoneReady');
                // Reset readiness for all players in the lobby
                players[lobbyId].forEach(p => p.isReady = false);
                io.to(lobbyId).emit('playersUpdate', players[lobbyId]); // Send updated player list to this lobby
            }
        }
    });

    // Handle leaving a lobby
    socket.on('leaveLobby', ({ playerName, lobbyId }) => {
        console.log(`${playerName} is leaving the lobby: ${lobbyId}`);
        
        if (players[lobbyId]) {
            // Remove player from the lobby
            players[lobbyId] = players[lobbyId].filter(player => player.socketId !== socket.id);

            // Notify the lobby about the updated player list
            io.to(lobbyId).emit('playersUpdate', players[lobbyId]);

            // Remove the lobby if it becomes empty
            if (players[lobbyId].length === 0) {
                delete players[lobbyId];
                console.log(`Lobby ${lobbyId} is now empty and has been removed.`);
            }

            // Leave the Socket.IO room
            socket.leave(lobbyId);

            // Emit a confirmation for the disconnection
            socket.emit('disconnectConfirmed');
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('A user disconnected');
        for (const lobbyId in players) {
            players[lobbyId] = players[lobbyId].filter(player => player.socketId !== socket.id);

            // Notify the lobby about the updated player list
            io.to(lobbyId).emit('playersUpdate', players[lobbyId]);

            // Remove the lobby if it becomes empty
            if (players[lobbyId].length === 0) {
                delete players[lobbyId];
                console.log(`Lobby ${lobbyId} is now empty and has been removed.`);
            }
        }
    });
});

server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
