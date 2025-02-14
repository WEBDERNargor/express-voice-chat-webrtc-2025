const socket = io('/');
let localStream;
let peerConnection;
let isMuted = false;

const joinBtn = document.getElementById('joinBtn');
const muteBtn = document.getElementById('muteBtn');
const leaveBtn = document.getElementById('leaveBtn');
const roomControls = document.getElementById('roomControls');
const statusDiv = document.getElementById('status');

// ICE servers configuration
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

// Create new peer connection
function createPeerConnection() {
    try {
        peerConnection = new RTCPeerConnection(configuration);
        
        // Add local stream
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Handle ICE candidates
        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                socket.emit('ice-candidate', {
                    candidate: event.candidate,
                    roomId: 'default-room'
                });
            }
        };
        
        // Handle incoming tracks
        peerConnection.ontrack = event => {
            console.log('Received remote track');
            const remoteAudio = document.createElement('audio');
            remoteAudio.srcObject = event.streams[0];
            remoteAudio.autoplay = true;
            document.body.appendChild(remoteAudio);
            
            // Add volume control
            addVolumeControl(remoteAudio);
        };
        
        return peerConnection;
    } catch (err) {
        console.error('Error creating peer connection:', err);
        return null;
    }
}

// Add volume control for remote audio
function addVolumeControl(audioElement) {
    const volumeControl = document.createElement('div');
    volumeControl.className = 'mt-4';
    volumeControl.innerHTML = `
        <label class="block text-sm font-medium text-gray-700 mb-1">Remote Volume</label>
        <input type="range" min="0" max="200" value="100" class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
               id="volumeSlider">
    `;
    
    roomControls.appendChild(volumeControl);
    
    const volumeSlider = document.getElementById('volumeSlider');
    volumeSlider.addEventListener('input', (e) => {
        audioElement.volume = e.target.value / 100;
    });
}

joinBtn.addEventListener('click', async () => {
    try {
        console.log('Attempting to get user media...');
        
        const constraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: false
        };
        
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('Successfully got local stream');
        
        // Create peer connection
        createPeerConnection();
        
        joinBtn.classList.add('hidden');
        roomControls.classList.remove('hidden');
        statusDiv.textContent = 'Connected to voice chat';
        statusDiv.classList.remove('text-red-500');
        
        // Join room
        socket.emit('join-room', 'default-room');
    } catch (err) {
        console.error('Error accessing microphone:', err);
        let errorMessage = `Error accessing microphone: ${err.message}`;
        
        if (!isSecureContext()) {
            errorMessage = 'Voice chat requires HTTPS or localhost. Please use a secure connection.';
        } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            errorMessage = 'Please allow microphone access in your browser settings.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            errorMessage = 'No microphone found. Please check your device settings.';
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
            errorMessage = 'Your microphone might be in use by another application.';
        }
        
        statusDiv.textContent = errorMessage;
        statusDiv.classList.add('text-red-500');
    }
});

muteBtn.addEventListener('click', () => {
    if (localStream) {
        isMuted = !isMuted;
        localStream.getAudioTracks()[0].enabled = !isMuted;
        muteBtn.textContent = isMuted ? 'Unmute' : 'Mute';
        muteBtn.classList.toggle('bg-gray-500');
        muteBtn.classList.toggle('bg-blue-500');
    }
});

leaveBtn.addEventListener('click', () => {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        localStream = null;
        
        // Remove all remote audio elements
        document.querySelectorAll('audio').forEach(audio => audio.remove());
        
        // Remove volume controls
        document.querySelectorAll('#volumeSlider').forEach(slider => {
            slider.parentElement.remove();
        });
        
        joinBtn.classList.remove('hidden');
        roomControls.classList.add('hidden');
        statusDiv.textContent = 'Disconnected';
        muteBtn.textContent = 'Mute';
        isMuted = false;
        
        socket.emit('leave-room', 'default-room');
    }
});

// Handle signaling
socket.on('user-connected', async () => {
    console.log('User connected, creating offer');
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', {
            offer: offer,
            roomId: 'default-room'
        });
    } catch (err) {
        console.error('Error creating offer:', err);
    }
});

socket.on('offer', async ({ offer }) => {
    console.log('Received offer, creating answer');
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', {
            answer: answer,
            roomId: 'default-room'
        });
    } catch (err) {
        console.error('Error creating answer:', err);
    }
});

socket.on('answer', async ({ answer }) => {
    console.log('Received answer');
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
        console.error('Error setting remote description:', err);
    }
});

socket.on('ice-candidate', async ({ candidate }) => {
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
        console.error('Error adding ICE candidate:', err);
    }
});
