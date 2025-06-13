class TwilioDialer {
    constructor() {
        this.device = null;
        this.activeCall = null;
        this.token = null;
        this.callStartTime = null;
        this.callTimer = null;
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
        this.callButton.addEventListener('click', () => this.makeCall());
        this.hangupButton.addEventListener('click', () => this.hangupCall());
        this.clearButton.addEventListener('click', () => this.clearNumber());
        
        // Phone number input
        this.phoneNumberInput.addEventListener('input', () => this.validatePhoneNumber());
        this.phoneNumberInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.makeCall();
            }
        });
        
        // Keypad
        this.keypadButtons.forEach(button => {
            button.addEventListener('click', () => {
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
                this.log(`🔍 Token Account SID: ${payload.iss || 'N/A'}`);
                this.log(`🔍 Token Identity: ${payload.sub || 'N/A'}`);
                this.log(`🔍 Token Grants: ${JSON.stringify(payload.grants || {}, null, 2)}`);
                this.log(`🔍 Token Expires: ${new Date(payload.exp * 1000).toLocaleString()}`);
                this.log(`🔍 Token Valid: ${payload.exp * 1000 > Date.now() ? 'YES' : 'NO'}`);
                
                // Check if voice grant exists
                if (payload.grants && payload.grants.voice) {
                    this.log(`✅ Voice grant found: ${JSON.stringify(payload.grants.voice, null, 2)}`);
                } else {
                    this.log(`❌ Voice grant MISSING from token!`);
                }
            } catch (e) {
                this.log(`⚠️ Token decode error: ${e.message}`);
            }
            
            // Initialize Twilio Device immediately when token is ready
            this.log('🚀 Token valmis - käivitan Twilio teenust...');
            await this.initializeTwilio();
            
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
            
            // Device event listeners with detailed debugging
            this.device.on('ready', () => {
                this.log('✅ Twilio Device READY!');
                this.log(`🔍 Device state: ${this.device.state}`);
                this.log(`🔍 Device identity: ${this.device.identity || 'N/A'}`);
                this.updateStatus('online', 'Valmis helistamiseks');
                this.deviceReady = true;
                this.validatePhoneNumber();
            });
            
            this.device.on('error', (error) => {
                this.log(`❌ Twilio ERROR: ${error.message}`);
                this.log(`❌ Error code: ${error.code || 'N/A'}`);
                this.log(`❌ Error name: ${error.name || 'N/A'}`);
                this.log(`❌ Full error: ${JSON.stringify(error, null, 2)}`);
                this.updateStatus('offline', `Viga: ${error.message}`);
            });
            
            this.device.on('tokenWillExpire', () => {
                this.log('⚠️ Token aegub varsti - uuendan...');
            });
            
            this.device.on('registering', () => {
                this.log('📡 REGISTERING to Twilio...');
                this.log(`🔍 Current state: ${this.device.state}`);
                this.updateStatus('connecting', 'Registreerimine...');
                
                // Set a timeout to detect stuck registration
                setTimeout(() => {
                    if (this.device && this.device.state === 'registering') {
                        this.log('⚠️ Registration võtab liiga kaua aega!');
                        this.log(`🔍 Device state stuck at: ${this.device.state}`);
                        this.testTwilioConnectivity();
                    }
                }, 10000); // 10 seconds timeout
            });
            
            this.device.on('registered', () => {
                this.log('✅ REGISTERED to Twilio successfully');
                this.log(`🔍 Device state: ${this.device.state}`);
            });
            
            this.device.on('unregistered', (error) => {
                this.log('📴 UNREGISTERED from Twilio');
                this.log(`🔍 Device state: ${this.device.state}`);
                if (error) {
                    this.log(`❌ Unregistration error: ${error.message}`);
                    this.log(`❌ Error details: ${JSON.stringify(error, null, 2)}`);
                }
                this.updateStatus('offline', 'Registreerimise viga');
            });

            this.device.on('offline', () => {
                this.log('📴 Device went OFFLINE');
                this.log(`🔍 Device state: ${this.device.state}`);
                this.updateStatus('offline', 'Ühendus kadunud');
            });

            // Additional connection events
            this.device.on('destroyed', () => {
                this.log('💥 Device DESTROYED');
            });
            
            // Log current device state every few seconds for debugging
            const stateLogger = setInterval(() => {
                if (this.device) {
                    this.log(`🔍 Device state check: ${this.device.state}`);
                    if (this.device.state === 'ready') {
                        clearInterval(stateLogger);
                    }
                } else {
                    clearInterval(stateLogger);
                }
            }, 3000);

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
        // Request microphone permission if not already granted
        try {
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
            this.log(`❌ Mikrofoni luba vajalik: ${error.message}`);
            this.updateStatus('offline', 'Mikrofoni luba vajalik');
            return;
        }

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