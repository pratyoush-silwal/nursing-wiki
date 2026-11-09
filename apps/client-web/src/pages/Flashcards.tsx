import { useState } from 'react';
import { parseDeck, replay, type Deck, type Flashcard } from '../../../../packages/shared/src/learning.ts';
import { Markdown } from '../../../../packages/shared/src/ui/Markdown.tsx';
export function Study({ deck }: {
    deck: Deck;
}) {
    const cards: Flashcard[] = parseDeck(deck.markdown);
    const [queue, setQueue] = useState(() => cards.map((_, i) => i)), [flipped, setFlipped] = useState(false);
    const card = cards[queue[0]];
    return <section className="study"><p className="eyebrow">Premium · {queue.length} remaining</p><h1>{deck.title}</h1>{card ? <><div className={`flashcard ${flipped ? 'flipped' : ''}`}><div className="flashcard-inner"><div className="flashcard-face" aria-hidden={flipped} inert={flipped}><p className="eyebrow">Question</p><Markdown text={card.front}/></div><div className="flashcard-face flashcard-back" aria-hidden={!flipped} inert={!flipped}><p className="eyebrow">Answer</p><Markdown text={card.back}/></div></div></div><button className="button secondary" onClick={() => setFlipped(!flipped)}>{flipped ? 'Show question' : 'Flip card'}</button>{flipped && <div className="ratings">{(['again', 'hard', 'good'] as const).map(r => <button key={r} className="button secondary" onClick={() => { setQueue(q => replay(q, r)); setFlipped(false); }}>{r[0].toUpperCase() + r.slice(1)}</button>)}</div>}</> : <div className="empty"><h2>That’s a good session.</h2><p>You’ve reviewed every card.</p><button className="button" onClick={() => { setQueue(cards.map((_, i) => i)); setFlipped(false); }}>Study again</button></div>}<p className="muted">Your replay order stays in this browser session. No study ratings are sent to the server.</p></section>;
}
