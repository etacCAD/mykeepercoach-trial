tell application "Google Chrome"
    set targetTab to missing value
    repeat with w in windows
        repeat with t in tabs of w
            if URL of t contains "goalie-coach-dev-11a17.web.app/dashboard?uid=iBakcTrmoeXjv7dSfLxf90ss8wd2" then
                set targetTab to t
                set index of w to 1
                set active tab of w to t
                exit repeat
            end if
        end repeat
        if targetTab is not missing value then exit repeat
    end repeat
    
    if targetTab is not missing value then
        tell targetTab
            execute javascript "
                (function() {
                    const btns = document.querySelectorAll('.re-analyze-btn');
                    let clicked = 0;
                    btns.forEach(b => { b.click(); clicked++; });
                    return 'Clicked ' + clicked + ' Re-analyze buttons';
                })();
            "
        end tell
    else
        return "Not found"
    end if
end tell
