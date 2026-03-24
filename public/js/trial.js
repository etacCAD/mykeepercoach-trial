// Scarcity Logic for Trial Page
document.addEventListener('DOMContentLoaded', () => {
    const spotsElement = document.getElementById('spots-remaining');
    let spots = 30;

    // Simulate spots decreasing very slowly to create urgency
    // In a real app, this would fetch from a database counter.
    
    // Check local storage so it persists per user/session for realism
    const storedSpots = localStorage.getItem('mkc_trial_spots');
    
    if (storedSpots) {
        spots = parseInt(storedSpots, 10);
    } else {
        // First visit: randomize slightly between 24 and 29 to look organic
        spots = Math.floor(Math.random() * 6) + 24;
        localStorage.setItem('mkc_trial_spots', spots);
    }
    
    // Ensure we don't go below a small number to keep the trial open
    if (spots < 7) {
        spots = Math.floor(Math.random() * 5) + 7;
        localStorage.setItem('mkc_trial_spots', spots);
    }

    // Initial render
    spotsElement.textContent = spots;

    // Set a random timer to decrement (every 45-120 seconds)
    const scheduleDecrement = () => {
        const nextTick = Math.floor(Math.random() * (120000 - 45000)) + 45000;
        
        setTimeout(() => {
            if (spots > 3) {
                spots--;
                spotsElement.textContent = spots;
                localStorage.setItem('mkc_trial_spots', spots);
                
                // Add a small visual pulse when the number changes
                spotsElement.parentElement.style.transform = 'scale(1.05)';
                setTimeout(() => {
                    spotsElement.parentElement.style.transform = 'scale(1)';
                    spotsElement.parentElement.style.transition = 'transform 0.2s';
                }, 200);
            }
            scheduleDecrement();
        }, nextTick);
    };

    scheduleDecrement();
});
