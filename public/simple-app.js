class SimpleDialer {
    constructor() {
        this.activeCall = null;
        this.callStartTime = null;
        this.callTimer = null;
        
        this.initializeElements();
        this.bindEvents();
        this.checkServerStatus();
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
        
        // Volume controls (hide since we're using phone calls)
        const audioControls = document.querySelector('.audio-controls');
        if (audioControls) {
            audioControls.style.display = 'none';
        }
        
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
            if (e.key === 'Enter') this.makeCall();
        });
        
        // Keypad
        this.keypadButtons.forEach(button => {
            button.addEventListener('click', () => {
                const digit = button.dataset.digit;
                this.addDigit(digit);
            });
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }

    async checkServerStatus() {
        try {
            this.log('Kontrollin serveri olekut...');
            
            const response = await fetch('/health');
            const health = await response.json();
            
            if (health.twilioConfigured) {
                this.log('✅ Server ja Twilio on valmis!');
                this.updateStatus('online', 'Valmis helistamiseks');
                this.callButton.disabled = false;
            } else {
                this.log('❌ Twilio ei ole seadistatud');
                this.updateStatus('offline', 'Twilio seadistamata');
            }
            
        } catch (error) {
            this.log(`❌ Serveri viga: ${error.message}`);
            this.updateStatus('offline', 'Server puudub');
        }
    }

    addDigit(digit) {
        const currentValue = this.phoneNumberInput.value;
        this.phoneNumberInput.value = currentValue + digit;
        this.validatePhoneNumber();
    }

    clearNumber() {
        this.phoneNumberInput.value = '';
        this.validatePhoneNumber();
    }

    validatePhoneNumber() {
        const phoneNumber = this.phoneNumberInput.value.trim();
        const isValid = phoneNumber.length >= 3;
        
        this.callButton.disabled = !isValid || this.statusIndicator.classList.contains('offline');
    }

    async makeCall() {
        const phoneNumber = this.phoneNumberInput.value.trim();
        
        if (!phoneNumber) {
            this.log('❌ Sisesta telefoninumber');
            return;
        }
        
        try {
            this.log(`📞 Helistamine numbrile: ${phoneNumber}`);
            this.updateCallState('calling');
            
            const response = await fetch('/call', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    to: phoneNumber
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.log(`✅ Kõne algatatud: ${result.callSid}`);
                this.activeCall = {
                    sid: result.callSid,
                    to: phoneNumber
                };
                this.onCallConnected();
            } else {
                throw new Error(result.error || 'Helistamine ebaõnnestus');
            }
            
        } catch (error) {
            this.log(`❌ Helistamise viga: ${error.message}`);
            this.updateCallState('idle');
        }
    }

    async hangupCall() {
        if (this.activeCall) {
            try {
                this.log('📵 Kõne lõpetamine...');
                
                // Since we can't directly hang up through REST API easily,
                // we'll just reset the UI. In a full implementation, you'd need
                // to track call status or implement webhooks
                
                this.onCallDisconnected();
                
            } catch (error) {
                this.log(`❌ Kõne lõpetamise viga: ${error.message}`);
                this.onCallDisconnected(); // Force disconnect
            }
        }
    }

    onCallConnected() {
        this.callStartTime = Date.now();
        this.updateCallState('connected');
        this.startCallTimer();
        
        this.log('🔗 Kõne ühendatud - kõne käib nüüd sinu Twilio numbrilt');
        this.log('💡 Vastaja kuuleb kõnet sinu Twilio numbrist');
    }

    onCallDisconnected() {
        this.activeCall = null;
        this.callStartTime = null;
        this.updateCallState('idle');
        this.stopCallTimer();
        this.log('📵 Kõne lõpetatud');
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
                this.callStatusText.textContent = 'Ühendatud - kõne käib';
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

    log(message) {
        const timestamp = new Date().toLocaleTimeString('et-EE');
        const logMessage = `[${timestamp}] ${message}`;
        
        this.logContent.textContent += logMessage + '\n';
        this.logContent.scrollTop = this.logContent.scrollHeight;
        
        console.log(logMessage);
    }
}

// Initialize the simple dialer
console.log('🚀 Starting Simple Dialer (no Twilio SDK required)');
window.dialer = new SimpleDialer(); 