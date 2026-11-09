const scripts = new Map<string, Promise<void>>();
export function loadScript(name: string) {
    if (!scripts.has(name))
        scripts.set(name, new Promise<void>((resolve, reject) => { const el = document.createElement('script'); el.src = `/vendor/${name}.js`; el.onload = () => resolve(); el.onerror = () => { el.remove(); scripts.delete(name); reject(new Error(`Could not load ${name}. Reload to try again.`)); }; document.head.append(el); }));
    return scripts.get(name)!;
}
