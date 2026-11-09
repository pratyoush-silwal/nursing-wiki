import { useEffect, useId, useState } from 'react';
import type { SearchHit } from '../index.ts';
export function Search({ initial = '', base = '', onSearch }: {
    initial?: string;
    base?: string;
    onSearch?: (query: string) => void;
}) {
    const [value, setValue] = useState(initial), [hits, setHits] = useState<SearchHit[]>([]), [active, setActive] = useState(-1), [open, setOpen] = useState(false);
    const id = useId();
    useEffect(() => setValue(initial), [initial]);
    useEffect(() => { setHits([]); setActive(-1); if (value.trim().length < 3)
        return; const controller = new AbortController(); const timer = setTimeout(() => { void fetch(`/api/search/suggest?q=${encodeURIComponent(value.trim())}`, { signal: controller.signal }).then(r => r.ok ? r.json() : { hits: [] }).then(data => setHits(data.hits)).catch(() => { }); }, 250); return () => { clearTimeout(timer); controller.abort(); }; }, [value]);
    return <div className="typeahead"><form role="search" className="search-form" onSubmit={e => { e.preventDefault(); setOpen(false); if (open && active >= 0 && hits[active])
        window.location.assign(`${base}/article/${hits[active].slug}`);
    else if (onSearch)
        onSearch(value.trim());
    else
        window.location.assign(`${base}/?q=${encodeURIComponent(value.trim())}`); }}><label className="sr-only" htmlFor={id}>Search articles</label><span aria-hidden="true">⌕</span><input id={id} type="search" role="combobox" aria-autocomplete="list" aria-expanded={open && hits.length > 0} aria-controls={`${id}-list`} aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined} autoComplete="off" value={value} maxLength={160} placeholder="Search a topic or keyword…" onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onChange={e => { setValue(e.target.value); setOpen(true); }} onKeyDown={e => { if (e.key === 'Escape') {
        setOpen(false);
        setActive(-1);
    } if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setOpen(true);
        setActive(i => hits.length ? (i < 0 ? (e.key === 'ArrowDown' ? 0 : hits.length - 1) : (i + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length) : -1);
    } }}/><button className="button" type="submit">Search</button></form>{open && hits.length > 0 && <ul className="suggestions" id={`${id}-list`} role="listbox">{hits.map((hit, i) => <li key={hit.id} id={`${id}-${i}`} role="option" aria-selected={active === i}><a tabIndex={-1} onMouseDown={e => e.preventDefault()} href={`${base}/article/${hit.slug}`}>{hit.name}<small>{hit.labels.slice(0, 2).join(' · ')}</small></a></li>)}</ul>}</div>;
}
