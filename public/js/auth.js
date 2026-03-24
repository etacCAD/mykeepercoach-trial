import { initFirebase } from "./firebase-config.js";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
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
                await signInWithEmailAndPassword(auth, email, password);
                
                // Route strictly based on admin email
                if (email === 'evan@tacanni.com') {
                    window.location.href = '/admin';
                } else {
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
    const signupErrorMsg = document.getElementById('signupErrorMsg');

    if(signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = signupEmailInput.value;
            const password = signupPasswordInput.value;
            const firstName = fnInput.value;
            const lastName = lnInput.value;
            const promoCode = promoInput ? promoInput.value.trim().toUpperCase() : '';
            
            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;
                
                // Add user to firestore
                await setDoc(doc(db, "users", user.uid), {
                    email: user.email,
                    firstName: firstName,
                    lastName: lastName,
                    role: 'keeper',
                    createdAt: new Date()
                });

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

                // Re-route to dashboard to trigger trial modal
                window.location.href = '/dashboard';
            } catch (error) {
                signupErrorMsg.style.display = 'block';
                signupErrorMsg.textContent = "Error: " + error.message;
            }
        });
    }
});
