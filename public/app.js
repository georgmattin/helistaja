class TwilioDialer {
    constructor() {
        this.device = null;
        this.activeCall = null;
        this.token = null;
        this.callStartTime = null;
        this.callTimer = null;
        this.audioContextResumed = false;
        this.deviceReady = false;
        
        this.initializeElements();
        this.bindEvents();
        this.prepareToken();
        this.setupAudioDevices();
    }

    initializeElements() {
        // UI Elements
        this.phoneNumberInput = document.getElementById('phoneNumber');
        this.callButton = document.getElementById('callButton');
        this.hangupButton = document.getElementById('hangupButton');
        this.clearButton = document.getElementById('clearNumber');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.statusText = document.getElementById('statusText');
        this.callInfo = document.getElementById('callInfo');
        this.callStatusText = document.getElementById('callStatusText');
        this.callDuration = document.getElementById('callDuration');
        this.logContent = document.getElementById('logContent');
        
        // Audio controls
        this.microphoneSelect = document.getElementById('microphoneSelect');
        this.speakerSelect = document.getElementById('speakerSelect');
        this.volumeSlider = document.getElementById('volumeSlider');
        this.volumeValue = document.getElementById('volumeValue');
        
        // Keypad
        this.keypadButtons = document.querySelectorAll('.key');
    }

    bindEvents() {
        // Call controls
        this.callButton.addEventListener('click', () => {
            this.resumeAudioContext();
            this.makeCall();
        });
        this.hangupButton.addEventListener('click', () => this.hangupCall());
        this.clearButton.addEventListener('click', () => this.clearNumber());
        
        // Phone number input
        this.phoneNumberInput.addEventListener('input', () => this.validatePhoneNumber());
        this.phoneNumberInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.resumeAudioContext();
                this.makeCall();
            }
        });
        
        // Keypad
        this.keypadButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.resumeAudioContext();
                const digit = button.dataset.digit;
                this.addDigit(digit);
            });
        });
        
        // Volume control
        this.volumeSlider.addEventListener('input', () => this.updateVolume());
        
        // Audio device selection
        this.microphoneSelect.addEventListener('change', () => this.updateAudioDevice('microphone'));
        this.speakerSelect.addEventListener('change', () => this.updateAudioDevice('speaker'));
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
        
        // First user interaction to enable audio
        document.addEventListener('click', () => this.resumeAudioContext(), { once: true });
    }

    async prepareToken() {
        try {
            this.log('Ettevalmistamine Twilio teenuseks...');
            this.updateStatus('connecting', 'Ettevalmistamine...');
            
            // Get access token from server
            const response = await fetch('/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                this.log(`❌ Server viga (${response.status}): ${errorText}`);
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            this.log('✅ Access token saadud serverist');
            this.token = data.token;
            
            // Debug: decode token to check contents
            try {
                const tokenParts = this.token.split('.');
                const payload = JSON.parse(atob(tokenParts[1]));
                this.log(`🔍 Token identity: ${payload.iss || 'N/A'}`);
                this.log(`🔍 Token grants: ${JSON.stringify(payload.grants || {})}`);
                this.log(`🔍 Token expires: ${new Date(payload.exp * 1000).toLocaleString()}`);
            } catch (e) {
                this.log(`⚠️ Token decode viga: ${e.message}`);
            }
            
            this.log('👆 Kliki mis tahes kohale, et käivitada mikrofoniga helistamine');
            this.updateStatus('offline', 'Kliki käivitamiseks');
            
        } catch (error) {
            this.log(`❌ Token viga: ${error.message}`);
            this.updateStatus('offline', 'Ettevalmistuse viga');
            
            // Check server health
            this.checkServerHealth();
        }
    }

    async initializeTwilio() {
        if (this.deviceReady || !this.token) return;
        
        try {
            this.log('🔄 Twilio Device initializeerimine...');
            this.updateStatus('connecting', 'Ühendamine...');
            
            // Initialize Twilio Device
            this.device = new Twilio.Device(this.token, {
                logLevel: 0, // Most verbose logging
                codecPreferences: ['opus', 'pcmu'],
                enableImprovedSignalingErrorPrecision: true,
                debug: true
            });
            
            // Device event listeners
            this.device.on('ready', () => {
                this.log('✅ Twilio ühendus valmis!');
                this.updateStatus('online', 'Valmis helistamiseks');
                this.deviceReady = true;
                this.validatePhoneNumber();
            });
            
            this.device.on('error', (error) => {
                this.log(`❌ Twilio viga: ${error.message}`);
                this.log(`❌ Error code: ${error.code || 'N/A'}`);
                this.log(`❌ Error details: ${JSON.stringify(error)}`);
                this.updateStatus('offline', 'Viga ühenduses');
            });
            
            this.device.on('tokenWillExpire', () => {
                this.log('⚠️ Token aegub varsti');
            });
            
            this.device.on('registering', () => {
                this.log('📡 Registreerimine Twilio serverisse...');
                this.updateStatus('connecting', 'Registreerimine...');
            });
            
            this.device.on('registered', () => {
                this.log('✅ Registreeritud Twilio serveris');
            });
            
            this.device.on('unregistered', (error) => {
                this.log('📴 Registreering tühistatud');
                if (error) {
                    this.log(`❌ Registreerimise viga: ${error.message}`);
                    this.log(`❌ Error details: ${JSON.stringify(error)}`);
                }
                this.updateStatus('offline', 'Registreerimise viga');
            });

            this.device.on('offline', () => {
                this.log('📴 Device läks offline');
                this.updateStatus('offline', 'Ühendus kadunud');
            });

            // Additional connection events
            this.device.on('destroyed', () => {
                this.log('💥 Device hävitatud');
            });

            // Listen for WebSocket events
            if (this.device.connection) {
                this.device.connection.on('error', (error) => {
                    this.log(`🔗 Connection error: ${error.message}`);
                });
            }
            
            this.device.on('incoming', (call) => {
                this.log(`📞 Sissetulev kõne: ${call.parameters.From}`);
            });
            
            this.device.on('connect', (call) => {
                this.log('🔗 Kõne ühendatud');
                this.onCallConnected(call);
            });
            
            this.device.on('disconnect', (call) => {
                this.log('📵 Kõne lõpetatud');
                this.onCallDisconnected();
            });
            
            this.log('🔄 Ootan Twilio ühendust...');
            
            // Set a timeout to detect if device doesn't become ready
            setTimeout(() => {
                if (!this.deviceReady) {
                    this.log('⚠️ Device ei saanud 10 sekundi jooksul ready...');
                    this.log(`📊 Device state: ${this.device?.state || 'undefined'}`);
                    this.log(`📊 Device status: ${this.device?.status || 'undefined'}`);
                    
                    // Try to get more debug info
                    if (this.device) {
                        this.log(`📊 Device audio: ${!!this.device.audio}`);
                        this.log(`📊 Device connection: ${this.device.connection || 'none'}`);
                    }
                    
                    // Test direct connection to Twilio
                    this.testTwilioConnectivity();
                }
            }, 10000);
            
        } catch (error) {
            this.log(`❌ Twilio ühenduse viga: ${error.message}`);
            this.updateStatus('offline', 'Ühenduse viga');
        }
    }

    async checkServerHealth() {
        try {
            const response = await fetch('/health');
            const health = await response.json();
            
            if (!health.twilioConfigured) {
                this.log('⚠️ Twilio ei ole seadistatud. Kontrolli .env faili.');
                this.updateStatus('offline', 'Twilio seadistamata');
            }
        } catch (error) {
            this.log('❌ Server ei ole kättesaadav');
            this.updateStatus('offline', 'Server puudub');
        }
    }

    async setupAudioDevices() {
        try {
            // First get devices without labels (no permission needed)
            let devices = await navigator.mediaDevices.enumerateDevices();
            
            // Clear existing options
            this.microphoneSelect.innerHTML = '<option value="">Vali mikrofon...</option>';
            this.speakerSelect.innerHTML = '<option value="">Vali väljund...</option>';
            
            devices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `${device.kind} ${device.deviceId.slice(0, 8)}...`;
                
                if (device.kind === 'audioinput') {
                    this.microphoneSelect.appendChild(option);
                } else if (device.kind === 'audiooutput') {
                    this.speakerSelect.appendChild(option);
                }
            });
            
            this.log('🎧 Audio seadmed laaditud (nimed saadaval pärast mikrofoni luba)');
            
        } catch (error) {
            this.log(`⚠️ Audio seadmete viga: ${error.message}`);
        }
    }

    async refreshAudioDevices() {
        try {
            // Get devices with labels after permission is granted
            const devices = await navigator.mediaDevices.enumerateDevices();
            
            // Clear existing options
            this.microphoneSelect.innerHTML = '<option value="">Vali mikrofon...</option>';
            this.speakerSelect.innerHTML = '<option value="">Vali väljund...</option>';
            
            devices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `${device.kind} ${device.deviceId.slice(0, 8)}...`;
                
                if (device.kind === 'audioinput') {
                    this.microphoneSelect.appendChild(option);
                } else if (device.kind === 'audiooutput') {
                    this.speakerSelect.appendChild(option);
                }
            });
            
            this.log('🎧 Audio seadmete nimed uuendatud');
            
        } catch (error) {
            this.log(`⚠️ Audio seadmete uuendamise viga: ${error.message}`);
        }
    }

    addDigit(digit) {
        const currentValue = this.phoneNumberInput.value;
        this.phoneNumberInput.value = currentValue + digit;
        this.validatePhoneNumber();
        
        // Send DTMF if in call
        if (this.activeCall) {
            this.activeCall.sendDigits(digit);
            this.log(`📞 DTMF saadetud: ${digit}`);
        }
    }

    clearNumber() {
        this.phoneNumberInput.value = '';
        this.validatePhoneNumber();
    }

    validatePhoneNumber() {
        const phoneNumber = this.phoneNumberInput.value.trim();
        const isValid = phoneNumber.length >= 3; // Minimum phone number length
        
        this.callButton.disabled = !isValid || !this.deviceReady || !this.device || this.device.state !== 'ready';
    }

    async makeCall() {
        const phoneNumber = this.phoneNumberInput.value.trim();
        
        if (!phoneNumber) {
            this.log('❌ Sisesta telefoninumber');
            return;
        }
        
        if (!this.device || this.device.state !== 'ready') {
            this.log('❌ Twilio ühendus pole valmis');
            return;
        }
        
        try {
            this.log(`📞 Helistamine numbrile: ${phoneNumber}`);
            
            // Show calling state
            this.updateCallState('calling');
            
            // Make the call
            const call = await this.device.connect({
                params: {
                    To: phoneNumber
                }
            });
            
            this.activeCall = call;
            
        } catch (error) {
            this.log(`❌ Helistamise viga: ${error.message}`);
            this.updateCallState('idle');
        }
    }

    hangupCall() {
        if (this.activeCall) {
            this.activeCall.disconnect();
            this.log('📵 Kõne katkestatud');
        }
    }

    onCallConnected(call) {
        this.activeCall = call;
        this.callStartTime = Date.now();
        this.updateCallState('connected');
        this.startCallTimer();
        
        // Call event listeners
        call.on('disconnect', () => {
            this.onCallDisconnected();
        });
        
        call.on('error', (error) => {
            this.log(`❌ Kõne viga: ${error.message}`);
            this.onCallDisconnected();
        });
    }

    onCallDisconnected() {
        this.activeCall = null;
        this.callStartTime = null;
        this.updateCallState('idle');
        this.stopCallTimer();
    }

    updateCallState(state) {
        switch (state) {
            case 'calling':
                this.callButton.style.display = 'none';
                this.hangupButton.style.display = 'flex';
                this.callInfo.style.display = 'block';
                this.callStatusText.textContent = 'Helistamine...';
                this.callStatusText.parentElement.classList.add('calling');
                break;
                
            case 'connected':
                this.callStatusText.textContent = 'Ühendatud';
                this.callStatusText.parentElement.classList.remove('calling');
                this.callStatusText.parentElement.classList.add('connected');
                break;
                
            case 'idle':
                this.callButton.style.display = 'flex';
                this.hangupButton.style.display = 'none';
                this.callInfo.style.display = 'none';
                this.callStatusText.parentElement.classList.remove('calling', 'connected');
                break;
        }
    }

    startCallTimer() {
        this.callTimer = setInterval(() => {
            if (this.callStartTime) {
                const elapsed = Date.now() - this.callStartTime;
                const minutes = Math.floor(elapsed / 60000);
                const seconds = Math.floor((elapsed % 60000) / 1000);
                this.callDuration.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }, 1000);
    }

    stopCallTimer() {
        if (this.callTimer) {
            clearInterval(this.callTimer);
            this.callTimer = null;
        }
        this.callDuration.textContent = '00:00';
    }

    updateVolume() {
        const volume = this.volumeSlider.value;
        this.volumeValue.textContent = `${volume}%`;
        
        if (this.device) {
            this.device.audio.outgoing(volume / 100);
        }
    }

    updateAudioDevice(type) {
        if (!this.device) return;
        
        const deviceId = type === 'microphone' 
            ? this.microphoneSelect.value 
            : this.speakerSelect.value;
            
        if (deviceId) {
            if (type === 'microphone') {
                this.device.audio.setInputDevice(deviceId);
                this.log(`🎤 Mikrofon muudetud: ${deviceId.slice(0, 8)}...`);
            } else {
                this.device.audio.setOutputDevice(deviceId);
                this.log(`🔊 Väljund muudetud: ${deviceId.slice(0, 8)}...`);
            }
        }
    }

    handleKeyboard(event) {
        // Number keys
        if (event.key >= '0' && event.key <= '9') {
            event.preventDefault();
            this.addDigit(event.key);
        }
        
        // Special keys
        switch (event.key) {
            case '*':
                event.preventDefault();
                this.addDigit('*');
                break;
            case '#':
                event.preventDefault();
                this.addDigit('#');
                break;
            case 'Backspace':
                if (event.target !== this.phoneNumberInput) {
                    event.preventDefault();
                    this.clearNumber();
                }
                break;
            case 'Enter':
                if (this.activeCall) {
                    this.hangupCall();
                } else {
                    this.makeCall();
                }
                break;
            case 'Escape':
                if (this.activeCall) {
                    this.hangupCall();
                }
                break;
        }
    }

    updateStatus(status, text) {
        this.statusIndicator.className = `status-indicator ${status}`;
        this.statusText.textContent = text;
    }

    async resumeAudioContext() {
        if (this.audioContextResumed) return;
        
        try {
            this.log('🔊 Kasutaja klikk - käivitan audio teenused...');
            
            // Request microphone permission first
            try {
                this.log('🎤 Küsin mikrofoni luba...');
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    audio: true, 
                    video: false 
                });
                this.log('✅ Mikrofoni luba saadud');
                
                // Stop the stream immediately - we just needed permission
                stream.getTracks().forEach(track => track.stop());
                
                // Refresh audio devices to get proper labels
                await this.refreshAudioDevices();
                
            } catch (error) {
                this.log(`❌ Mikrofoni luba keeldutud: ${error.message}`);
                this.updateStatus('offline', 'Mikrofoni luba vajalik');
                return;
            }
            
            // Initialize Twilio Device now that we have user gesture and mic permission
            if (!this.deviceReady && this.token) {
                await this.initializeTwilio();
            }
            
            this.audioContextResumed = true;
            
        } catch (error) {
            this.log(`⚠️ Audio käivitamise viga: ${error.message}`);
        }
    }

    async testTwilioConnectivity() {
        try {
            this.log('🔍 Testimine Twilio ühenduvust...');
            
            // Test if we can reach Twilio's servers
            const response = await fetch('https://eventgw.twilio.com/health', {
                method: 'GET',
                mode: 'no-cors'
            });
            this.log('✅ Twilio serverid kättesaadavad');
            
        } catch (error) {
            this.log(`❌ Twilio serveri test: ${error.message}`);
            this.log('⚠️ Võimalik firewall või proxy probleem');
        }
    }

    log(message) {
        const timestamp = new Date().toLocaleTimeString('et-EE');
        const logMessage = `[${timestamp}] ${message}`;
        
        this.logContent.textContent += logMessage + '\n';
        this.logContent.scrollTop = this.logContent.scrollHeight;
        
        console.log(logMessage);
    }
}

// Initialize the dialer when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing Twilio Dialer...');
    console.log('Twilio object available:', typeof Twilio);
    
    if (typeof Twilio !== 'undefined') {
        console.log('✅ Twilio SDK loaded successfully');
        window.dialer = new TwilioDialer();
    } else {
        console.error('❌ Twilio SDK not available');
        document.getElementById('statusText').textContent = 'Twilio SDK ei ole kättesaadav';
    }
}); 