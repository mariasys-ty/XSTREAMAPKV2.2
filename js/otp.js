/**
 * xStream Email OTP Verification
 * Handles OTP generation, sending, and verification
 * Email only delivery via EmailJS
 */

(function() {
    'use strict';

    // ============================================
    // CONFIGURATION - READS FROM config.js
    // ============================================
    const CONFIG = {
        // EmailJS Settings (read from config.js)
        EMAILJS_PUBLIC_KEY: ENV_CONFIG.EMAILJS_PUBLIC_KEY,
        EMAILJS_SERVICE_ID: ENV_CONFIG.EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID: ENV_CONFIG.EMAILJS_TEMPLATE_ID,
        
        // OTP Settings
        OTP_LENGTH: 6,
        OTP_EXPIRY_SECONDS: 300, // 5 minutes
        RESEND_COOLDOWN_SECONDS: 60, // 1 minute
        MAX_ATTEMPTS: 5,
        
        // Firebase path for storing OTPs
        OTP_DB_PATH: 'email_verifications',
        
        // Redirect
        SUCCESS_REDIRECT: 'homepage.html',
        SIGNUP_PAGE: 'signup.html'
    };

    // ============================================
    // INITIALIZE EMAILJS
    // ============================================
    emailjs.init(CONFIG.EMAILJS_PUBLIC_KEY);

    // ============================================
    // STATE
    // ============================================
    let userEmail = '';
    let signupData = null;
    let timerInterval = null;
    let attempts = 0;
    let isVerifying = false;

    // ============================================
    // DOM ELEMENTS
    // ============================================
    const elements = {
        displayEmail: document.getElementById('display-email'),
        otpInputs: document.querySelectorAll('.otp-input'),
        verifyBtn: document.getElementById('verify-btn'),
        verifyBtnText: document.querySelector('#verify-btn .btn-text'),
        verifyBtnSpinner: document.querySelector('#verify-btn .otp-spinner'),
        resendBtn: document.getElementById('resend-btn'),
        backBtn: document.getElementById('back-btn'),
        timer: document.getElementById('otp-timer'),
        message: document.getElementById('otp-message'),
        successOverlay: document.getElementById('success-overlay'),
        redirectCountdown: document.getElementById('redirect-countdown')
    };

    // ============================================
    // INITIALIZE
    // ============================================
    function init() {
        // Get signup data from sessionStorage
        const storedData = sessionStorage.getItem('xstream_signup_data');
        
        if (!storedData) {
            // No signup data found, redirect back
            window.location.href = CONFIG.SIGNUP_PAGE;
            return;
        }
        
        try {
            signupData = JSON.parse(storedData);
            userEmail = signupData.email;
            
            // Check if data is too old (older than 10 minutes)
            if (Date.now() - signupData.timestamp > 600000) {
                sessionStorage.removeItem('xstream_signup_data');
                window.location.href = CONFIG.SIGNUP_PAGE;
                return;
            }
            
            // Display email (mask it for privacy)
            elements.displayEmail.textContent = maskEmail(userEmail);
            
        } catch (e) {
            console.error('Error parsing signup data:', e);
            window.location.href = CONFIG.SIGNUP_PAGE;
            return;
        }
        
        // Setup event listeners
        setupOtpInputs();
        setupButtons();
        
        // Send OTP automatically
        sendOTP();
        
        // Focus first input
        setTimeout(() => {
            elements.otpInputs[0].focus();
        }, 500);
    }

    // ============================================
    // GENERATE 6-DIGIT OTP
    // ============================================
    function generateOTP() {
        // Using crypto API for better randomness
        const array = new Uint32Array(1);
        crypto.getRandomValues(array);
        
        // Generate 6-digit number (100000-999999)
        return (array[0] % 900000 + 100000).toString();
    }

    // ============================================
    // SEND OTP
    // ============================================
    async function sendOTP() {
        const otp = generateOTP();
        console.log('Generated OTP:', otp); // Remove in production
        
        const emailKey = userEmail.replace(/\./g, '_');
        const otpData = {
            code: otp,
            email: userEmail,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            expiresAt: Date.now() + (CONFIG.OTP_EXPIRY_SECONDS * 1000),
            attempts: 0,
            verified: false
        };
        
        let emailSent = false;
        
        try {
            // Send OTP via EmailJS
            console.log('Sending email via EmailJS...');
            await emailjs.send(
                CONFIG.EMAILJS_SERVICE_ID,
                CONFIG.EMAILJS_TEMPLATE_ID,
                {
                    email: userEmail,
                    name: signupData.fullName,
                    otp: otp,
                    expiry_minutes: Math.floor(CONFIG.OTP_EXPIRY_SECONDS / 60)
                }
            );
            emailSent = true;
            console.log('Email sent successfully!');
            
            // Save OTP to Firebase
            console.log('Saving OTP to Firebase...');
            await firebase.database()
                .ref(CONFIG.OTP_DB_PATH + '/' + emailKey)
                .set(otpData);
            console.log('OTP saved to Firebase!');
            
            // Reset state
            attempts = 0;
            clearOtpInputs();
            hideMessage();
            startTimer(CONFIG.RESEND_COOLDOWN_SECONDS);
            
        } catch (error) {
            console.error('Error in sendOTP:', error);
            
            // If email sent but Firebase failed, still count as success
            if (emailSent) {
                console.warn('Email sent but Firebase failed. User can still verify.');
                clearOtpInputs();
                hideMessage();
                startTimer(CONFIG.RESEND_COOLDOWN_SECONDS);
                return;
            }
            
            // Otherwise, show error
            let errorMsg = 'Failed to send code. ';
            if (error.status) errorMsg += 'Error ' + error.status + ': ';
            errorMsg += error.text || error.message || 'Please try again.';
            
            showMessage(errorMsg, 'error');
        }
    }

    // ============================================
    // VERIFY OTP
    // ============================================
    async function verifyOTP() {
        if (isVerifying) return;
        
        const enteredOtp = getOtpValue();
        
        if (enteredOtp.length !== CONFIG.OTP_LENGTH) {
            showMessage('Please enter the complete 6-digit code', 'error');
            shakeInputs();
            return;
        }
        
        isVerifying = true;
        setVerifyLoading(true);
        hideMessage();
        
        const emailKey = userEmail.replace(/\./g, '_');
        
        try {
            // Get stored OTP from Firebase
            const snapshot = await firebase.database()
                .ref(CONFIG.OTP_DB_PATH + '/' + emailKey)
                .once('value');
            
            if (!snapshot.exists()) {
                throw { code: 'NOT_FOUND', message: 'No verification code found. Please request a new one.' };
            }
            
            const otpData = snapshot.val();
            
            // Check if already verified
            if (otpData.verified) {
                throw { code: 'ALREADY_VERIFIED', message: 'This code has already been used.' };
            }
            
            // Check expiry
            if (Date.now() > otpData.expiresAt) {
                // Clean up expired OTP
                await firebase.database()
                    .ref(CONFIG.OTP_DB_PATH + '/' + emailKey)
                    .remove();
                throw { code: 'EXPIRED', message: 'Code has expired. Please request a new one.' };
            }
            
            // Check attempts
            const currentAttempts = (otpData.attempts || 0) + 1;
            if (currentAttempts > CONFIG.MAX_ATTEMPTS) {
                await firebase.database()
                    .ref(CONFIG.OTP_DB_PATH + '/' + emailKey)
                    .remove();
                throw { code: 'MAX_ATTEMPTS', message: 'Too many failed attempts. Please request a new code.' };
            }
            
            // Update attempt count
            await firebase.database()
                .ref(CONFIG.OTP_DB_PATH + '/' + emailKey + '/attempts')
                .set(currentAttempts);
            
            // Compare codes
            if (otpData.code !== enteredOtp) {
                const remaining = CONFIG.MAX_ATTEMPTS - currentAttempts;
                throw { 
                    code: 'INVALID', 
                    message: remaining > 0 
                        ? 'Invalid code. ' + remaining + ' attempt' + (remaining > 1 ? 's' : '') + ' remaining.' 
                        : 'Invalid code.'
                };
            }
            
            // OTP VERIFIED SUCCESSFULLY
            await firebase.database()
                .ref(CONFIG.OTP_DB_PATH + '/' + emailKey + '/verified')
                .set(true);
            
            // Mark inputs as success
            elements.otpInputs.forEach(function(input) {
                input.classList.remove('error');
                input.classList.add('success');
            });
            
            showMessage('Verified!', 'success');
            
            // Create the user account in Firebase
            await createUserAccount();
            
            // Show success and redirect
            showSuccessAndRedirect();
            
        } catch (error) {
            console.error('Verification error:', error);
            showMessage(error.message, 'error');
            shakeInputs();
            clearOtpInputs();
            elements.otpInputs[0].focus();
        } finally {
            isVerifying = false;
            setVerifyLoading(false);
        }
    }

    // ============================================
    // CREATE USER ACCOUNT IN FIREBASE
    // Saves under userAccounts/{uid}
    // ============================================
    async function createUserAccount() {
        try {
            // Create Firebase Auth account
            const userCredential = await firebase.auth().createUserWithEmailAndPassword(
                signupData.email,
                signupData.password
            );
            
            const user = userCredential.user;
            
            // Update display name
            await user.updateProfile({
                displayName: signupData.fullName
            });
            
            // Store user data under userAccounts/{uid}
            var userData = {
                fullName: signupData.fullName,
                email: signupData.email,
                emailVerified: true,
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                uid: user.uid
            };
            
            await firebase.database()
                .ref('userAccounts/' + user.uid)
                .set(userData);
            
            // Clean up OTP data
            var emailKey = userEmail.replace(/\./g, '_');
            await firebase.database()
                .ref(CONFIG.OTP_DB_PATH + '/' + emailKey)
                .remove();
            
            // Clean up signup data
            sessionStorage.removeItem('xstream_signup_data');
            
            console.log('Account created successfully:', user.uid);
            
        } catch (error) {
            console.error('Error creating account:', error);
            
            // Handle specific Firebase Auth errors
            var errorMessage = 'Failed to create account. Please try signing up again.';
            
            switch (error.code) {
                case 'auth/email-already-in-use':
                    errorMessage = 'An account with this email already exists.';
                    break;
                case 'auth/weak-password':
                    errorMessage = 'Password is too weak. Please use a stronger password.';
                    break;
                case 'auth/operation-not-allowed':
                    errorMessage = 'Email/password sign-up is not enabled.';
                    break;
            }
            
            throw { code: 'ACCOUNT_ERROR', message: errorMessage };
        }
    }

    // ============================================
    // SUCCESS & REDIRECT
    // ============================================
    function showSuccessAndRedirect() {
        // Disable all inputs
        elements.otpInputs.forEach(function(input) { input.disabled = true; });
        elements.verifyBtn.style.display = 'none';
        elements.resendBtn.style.display = 'none';
        elements.backBtn.style.display = 'none';
        elements.timer.style.display = 'none';
        hideMessage();
        
        // Show success overlay
        elements.successOverlay.classList.add('show');
        
        // Countdown redirect
        var countdown = 3;
        elements.redirectCountdown.textContent = countdown;
        
        var redirectInterval = setInterval(function() {
            countdown--;
            elements.redirectCountdown.textContent = countdown;
            
            if (countdown <= 0) {
                clearInterval(redirectInterval);
                window.location.href = CONFIG.SUCCESS_REDIRECT;
            }
        }, 1000);
    }

    // ============================================
    // OTP INPUT HANDLING
    // ============================================
    function setupOtpInputs() {
        elements.otpInputs.forEach(function(input, index) {
            // Handle input
            input.addEventListener('input', function(e) {
                // Allow only numbers
                this.value = this.value.replace(/[^0-9]/g, '');
                
                // Add filled class
                if (this.value) {
                    this.classList.add('filled');
                } else {
                    this.classList.remove('filled');
                }
                
                // Remove error class
                this.classList.remove('error');
                
                // Move to next input
                if (this.value && index < elements.otpInputs.length - 1) {
                    elements.otpInputs[index + 1].focus();
                }
                
                // Enable/disable verify button
                updateVerifyButton();
            });
            
            // Handle keydown
            input.addEventListener('keydown', function(e) {
                // Move to previous on backspace
                if (e.key === 'Backspace' && !this.value && index > 0) {
                    elements.otpInputs[index - 1].focus();
                    elements.otpInputs[index - 1].value = '';
                    elements.otpInputs[index - 1].classList.remove('filled');
                    updateVerifyButton();
                }
                
                // Submit on Enter
                if (e.key === 'Enter') {
                    verifyOTP();
                }
            });
            
            // Handle paste
            input.addEventListener('paste', function(e) {
                e.preventDefault();
                var pastedData = e.clipboardData.getData('text').replace(/[^0-9]/g, '');
                
                if (pastedData.length > 0) {
                    for (var i = 0; i < Math.min(pastedData.length, CONFIG.OTP_LENGTH); i++) {
                        elements.otpInputs[i].value = pastedData[i];
                        elements.otpInputs[i].classList.add('filled');
                    }
                    
                    // Focus last filled or next empty
                    var focusIndex = Math.min(pastedData.length, CONFIG.OTP_LENGTH - 1);
                    elements.otpInputs[focusIndex].focus();
                    updateVerifyButton();
                }
            });
            
            // Handle focus
            input.addEventListener('focus', function() {
                this.select();
            });
        });
    }

    function getOtpValue() {
        return Array.from(elements.otpInputs)
            .map(function(input) { return input.value; })
            .join('');
    }

    function clearOtpInputs() {
        elements.otpInputs.forEach(function(input) {
            input.value = '';
            input.classList.remove('filled', 'error', 'success');
        });
        updateVerifyButton();
    }

    function updateVerifyButton() {
        var otp = getOtpValue();
        elements.verifyBtn.disabled = otp.length !== CONFIG.OTP_LENGTH;
    }

    function shakeInputs() {
        elements.otpInputs.forEach(function(input) {
            input.classList.add('error');
            setTimeout(function() { input.classList.remove('error'); }, 600);
        });
    }

    // ============================================
    // BUTTON HANDLERS
    // ============================================
    function setupButtons() {
        elements.verifyBtn.addEventListener('click', verifyOTP);
        
        elements.resendBtn.addEventListener('click', async function() {
            this.disabled = true;
            this.textContent = 'Sending...';
            
            await sendOTP();
            
            this.disabled = false;
            this.textContent = 'Resend Code';
        });
        
        elements.backBtn.addEventListener('click', function() {
            if (confirm('Going back will cancel your signup. Continue?')) {
                sessionStorage.removeItem('xstream_signup_data');
                window.location.href = CONFIG.SIGNUP_PAGE;
            }
        });
    }

    function setVerifyLoading(loading) {
        if (loading) {
            elements.verifyBtnText.textContent = 'Verifying...';
            elements.verifyBtnSpinner.style.display = 'block';
            elements.verifyBtn.disabled = true;
        } else {
            elements.verifyBtnText.textContent = 'Verify Code';
            elements.verifyBtnSpinner.style.display = 'none';
            updateVerifyButton();
        }
    }

    // ============================================
    // TIMER
    // ============================================
    function startTimer(seconds) {
        clearInterval(timerInterval);
        
        elements.resendBtn.style.display = 'none';
        elements.timer.style.display = 'block';
        
        var remaining = seconds;
        elements.timer.innerHTML = 'Resend code in <span class="countdown">' + remaining + 's</span>';
        
        timerInterval = setInterval(function() {
            remaining--;
            elements.timer.innerHTML = 'Resend code in <span class="countdown">' + remaining + 's</span>';
            
            if (remaining <= 0) {
                clearInterval(timerInterval);
                elements.timer.style.display = 'none';
                elements.resendBtn.style.display = 'block';
            }
        }, 1000);
    }

    // ============================================
    // MESSAGES
    // ============================================
    function showMessage(text, type) {
        elements.message.textContent = text;
        elements.message.className = 'otp-message show ' + type;
    }

    function hideMessage() {
        elements.message.className = 'otp-message';
    }

    // ============================================
    // UTILITIES
    // ============================================
    function maskEmail(email) {
        var parts = email.split('@');
        var user = parts[0];
        var domain = parts[1];
        var maskedUser = user.length > 2 
            ? user[0] + '*'.repeat(user.length - 2) + user[user.length - 1]
            : user[0] + '*'.repeat(user.length - 1);
        return maskedUser + '@' + domain;
    }

    // ============================================
    // START
    // ============================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();