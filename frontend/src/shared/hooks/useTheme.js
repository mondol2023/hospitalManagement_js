import { useCallback, useEffect, useState } from 'react';
/**
 * The theme preference is the *only* thing this app writes to localStorage.
 * Auth tokens deliberately live in memory and nowhere else (ARCHITECTURE.md
 * §3) — a colour preference is not a credential, and losing it on every reload
 * would be a worse experience for no security gain.
 *
 * The key matches the pre-paint script in index.html, which applies the class
 * before first paint so a dark-theme user never sees a white flash.
 */
const STORAGE_KEY = 'hms.theme';
function currentTheme() {
    if (typeof document === 'undefined')
        return 'light';
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}
export function useTheme() {
    const [theme, setThemeState] = useState(currentTheme);
    const setTheme = useCallback((next) => {
        document.documentElement.classList.toggle('dark', next === 'dark');
        try {
            window.localStorage.setItem(STORAGE_KEY, next);
        }
        catch {
            // Private browsing or a storage quota error. The theme still applies for
            // this session; only the persistence is lost, which is not worth a crash.
        }
        setThemeState(next);
    }, []);
    // Follow the OS while the user has not made an explicit choice.
    useEffect(() => {
        let stored = null;
        try {
            stored = window.localStorage.getItem(STORAGE_KEY);
        }
        catch {
            stored = null;
        }
        if (stored === 'light' || stored === 'dark')
            return;
        const list = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = (event) => {
            document.documentElement.classList.toggle('dark', event.matches);
            setThemeState(event.matches ? 'dark' : 'light');
        };
        list.addEventListener('change', onChange);
        return () => list.removeEventListener('change', onChange);
    }, []);
    const toggle = useCallback(() => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'), [setTheme]);
    return { theme, setTheme, toggle };
}
