tell application "Google Chrome" to activate
tell application "System Events"
    keystroke "f" using command down
    delay 0.5
    keystroke "Re-analyze"
    delay 0.5
    key code 53
    delay 0.5
    key code 36
end tell
