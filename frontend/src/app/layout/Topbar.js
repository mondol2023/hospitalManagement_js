import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AnimatePresence, motion } from 'framer-motion';
import { LogOut, Menu, Moon, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAuthStore, useLogout } from '@/features/auth';
import { cn } from '@/shared/lib/cn';
import { initials } from '@/shared/lib/format';
import { roleLabel } from '@/shared/lib/roles';
import { useTheme } from '@/shared/hooks/useTheme';
import { fade } from '@/shared/motion/variants';
import { Button } from '@/shared/ui';
const iconButton = 'inline-flex h-9 w-9 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-raised hover:text-content';
export function Topbar({ onOpenNav, slot }) {
    const user = useAuthStore((state) => state.user);
    const { theme, toggle } = useTheme();
    return (_jsxs("header", { className: "sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/95 px-4 backdrop-blur", children: [_jsx("button", { type: "button", onClick: onOpenNav, className: cn(iconButton, 'lg:hidden'), "aria-label": "Open navigation", children: _jsx(Menu, { className: "h-4 w-4", "aria-hidden": "true" }) }), _jsx("div", { className: "flex-1" }), slot, _jsx("button", { type: "button", onClick: toggle, className: iconButton, "aria-label": theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', children: theme === 'dark' ? (_jsx(Sun, { className: "h-4 w-4", "aria-hidden": "true" })) : (_jsx(Moon, { className: "h-4 w-4", "aria-hidden": "true" })) }), user && _jsx(UserMenu, { name: user.name, role: roleLabel(user.role) })] }));
}
function UserMenu({ name, role }) {
    const [open, setOpen] = useState(false);
    const logout = useLogout();
    const containerRef = useRef(null);
    // Close on outside click and on Escape. Small enough not to warrant a Radix
    // popover — but not small enough to skip the keyboard path.
    useEffect(() => {
        if (!open)
            return;
        const onPointerDown = (event) => {
            if (!containerRef.current?.contains(event.target))
                setOpen(false);
        };
        const onKeyDown = (event) => {
            if (event.key === 'Escape')
                setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);
    return (_jsxs("div", { className: "relative", ref: containerRef, children: [_jsxs("button", { type: "button", onClick: () => setOpen((value) => !value), "aria-expanded": open, "aria-haspopup": "menu", className: "flex items-center gap-2 rounded-control py-1 pl-1 pr-2 transition-colors hover:bg-surface-raised", children: [_jsx("span", { "aria-hidden": "true", className: "flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft font-display text-2xs font-bold text-brand", children: initials(name) }), _jsxs("span", { className: "hidden text-left sm:block", children: [_jsx("span", { className: "block text-xs font-medium leading-tight", children: name }), _jsx("span", { className: "block text-2xs leading-tight text-muted", children: role })] })] }), _jsx(AnimatePresence, { children: open && (_jsxs(motion.div, { role: "menu", variants: fade, initial: "hidden", animate: "visible", exit: "hidden", className: "absolute right-0 top-full z-40 mt-1 w-56 rounded-card border border-line bg-surface p-1 shadow-pop", children: [_jsxs("div", { className: "border-b border-line px-3 py-2", children: [_jsx("p", { className: "truncate text-sm font-medium", children: name }), _jsx("p", { className: "text-xs text-muted", children: role })] }), _jsx(Button, { variant: "ghost", size: "sm", block: true, className: "mt-1 justify-start", leadingIcon: _jsx(LogOut, { className: "h-4 w-4" }), loading: logout.isPending, onClick: () => logout.mutate(), children: "Sign out" })] })) })] }));
}
