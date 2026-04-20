import { initFirebase } from "./firebase-config.js";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

document.addEventListener('DOMContentLoaded', async () => {
    const { auth, db } = await initFirebase();
    
    // Login Elements
    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorMsg = document.getElementById('errorMsg');

    if(loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = emailInput.value;
            const password = passwordInput.value;
            
            try {
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;
                
                // Route strictly based on admin email
                if (email === 'evan@tacanni.com') {
                    window.location.href = '/admin';
                } else {
                    if (!user.emailVerified) {
                        auth.signOut();
                        errorMsg.style.display = 'block';
                        errorMsg.textContent = "Error: Please verify your email address before logging in. Check your inbox/spam folder.";
                        return;
                    }
                    window.location.href = '/dashboard';
                }
            } catch (error) {
                errorMsg.style.display = 'block';
                errorMsg.textContent = "Error: " + error.message;
            }
        });
    }

    // Signup Elements
    const signupForm = document.getElementById('signupForm');
    const signupEmailInput = document.getElementById('signupEmail');
    const signupPasswordInput = document.getElementById('signupPassword');
    const fnInput = document.getElementById('firstName');
    const lnInput = document.getElementById('lastName');
    const promoInput = document.getElementById('promoCode');
    const dobInput = document.getElementById('dob');
    const guardianEmailInput = document.getElementById('guardianEmail');
    const parentalConsentGroup = document.getElementById('parentalConsentGroup');
    const tosAcceptInput = document.getElementById('tosAccept');
    const signupErrorMsg = document.getElementById('signupErrorMsg');

    if (dobInput) {
        dobInput.addEventListener('change', () => {
            const dob = new Date(dobInput.value);
            const ageDifMs = Date.now() - dob.getTime();
            const ageDate = new Date(ageDifMs);
            const age = Math.abs(ageDate.getUTCFullYear() - 1970);
            
            if (age < 13) {
                parentalConsentGroup.style.display = 'flex';
                guardianEmailInput.setAttribute('required', 'true');
            } else {
                parentalConsentGroup.style.display = 'none';
                guardianEmailInput.removeAttribute('required');
            }
        });
    }

    if(signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = signupEmailInput.value;
            const password = signupPasswordInput.value;
            const firstName = fnInput.value;
            const lastName = lnInput.value;
            const dob = dobInput.value;
            const isMinor = window.getComputedStyle(parentalConsentGroup).display === 'flex';
            const guardianEmail = guardianEmailInput.value;
            const tosAccepted = tosAcceptInput.checked;
            const promoCode = promoInput ? promoInput.value.trim().toUpperCase() : '';

            // Password complexity check
            const passwordRegex = /^(?=.*[0-9\W]).{8,}$/;
            if (!passwordRegex.test(password)) {
                signupErrorMsg.style.display = 'block';
                signupErrorMsg.textContent = "Error: Password must be at least 8 characters and contain a number or symbol.";
                return;
            }
            
            if (!tosAccepted) {
                signupErrorMsg.style.display = 'block';
                signupErrorMsg.textContent = "Error: You must accept the Terms of Service.";
                return;
            }

            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;
                
                // Add user to firestore
                const userData = {
                    email: user.email,
                    firstName: firstName,
                    lastName: lastName,
                    role: 'keeper',
                    dob: dob,
                    createdAt: new Date(),
                    tosAccepted: true
                };

                if (isMinor) {
                    userData.guardianEmail = guardianEmail;
                    userData.parentalConsentVerified = false;
                }

                await setDoc(doc(db, "users", user.uid), userData);

                await sendEmailVerification(user);

                // If a promo code was entered, redeem it
                if (promoCode) {
                    try {
                        const functions = getFunctions();
                        const redeemPromoCode = httpsCallable(functions, 'redeemPromoCode');
                        await redeemPromoCode({ code: promoCode });
                    } catch (promoErr) {
                        // Non-blocking: show a warning but still redirect
                        signupErrorMsg.style.display = 'block';
                        signupErrorMsg.style.color = '#f59e0b';
                        signupErrorMsg.textContent = `Account created! Promo code not applied: ${promoErr.message}`;
                        await new Promise(r => setTimeout(r, 2500));
                    }
                }

                // Show success message and ask to verify
                signupErrorMsg.style.display = 'block';
                signupErrorMsg.style.color = '#10b981'; // Green
                signupErrorMsg.textContent = "Account created! Please check your email to verify your account before logging in.";
                signupBtn.disabled = true;
                
            } catch (error) {
                signupErrorMsg.style.display = 'block';
                signupErrorMsg.textContent = "Error: " + error.message;
            }
        });
    }

    // Forgot Password Elements
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    const forgotPasswordModal = document.getElementById('forgotPasswordModal');
    const closeForgotPasswordModalBtn = document.getElementById('closeForgotPasswordModal');
    const cancelResetBtn = document.getElementById('cancelResetBtn');
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    const resetEmailInput = document.getElementById('resetEmail');
    const resetMsg = document.getElementById('resetMsg');
    const sendResetBtn = document.getElementById('sendResetBtn');

    if (forgotPasswordLink && forgotPasswordModal) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            // Pre-fill email if entered in the login form
            if (emailInput && emailInput.value) {
                resetEmailInput.value = emailInput.value;
            }
            forgotPasswordModal.style.display = 'flex';
            resetMsg.style.display = 'none';
        });

        const closeForgotModal = () => {
            forgotPasswordModal.style.display = 'none';
            forgotPasswordForm.reset();
            resetMsg.style.display = 'none';
        };

        closeForgotPasswordModalBtn.addEventListener('click', closeForgotModal);
        cancelResetBtn.addEventListener('click', closeForgotModal);
        forgotPasswordModal.addEventListener('click', (e) => {
            if (e.target === forgotPasswordModal) closeForgotModal();
        });

        forgotPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = resetEmailInput.value.trim();
            if (!email) return;

            try {
                sendResetBtn.disabled = true;
                sendResetBtn.textContent = 'Sending...';
                await sendPasswordResetEmail(auth, email);
                resetMsg.style.display = 'block';
                resetMsg.style.color = '#48bb78'; // Green success color
                resetMsg.textContent = 'Password reset email sent! Check your inbox.';
            } catch (error) {
                resetMsg.style.display = 'block';
                resetMsg.style.color = 'var(--danger, #fc8181)';
                resetMsg.textContent = "Error: " + error.message;
            } finally {
                sendResetBtn.disabled = false;
                sendResetBtn.textContent = 'Send Reset Link';
            }
        });
    }
});
