// Quiet reading typography, scoped ONLY to source-preserving generated documents.
// Existing host palette; semantic grouping, not decorative dashboard/card chrome.
export const documentStyle=`
.exo-document{max-width:78ch;margin-inline:auto;font-family:ui-sans-serif,system-ui,sans-serif;font-size:15px;line-height:1.65;color:var(--foreground,#202124);width:100%}
.exo-document .a2ui-text{font-size:inherit;line-height:inherit;overflow-wrap:anywhere}
.exo-document .a2ui-text h1{font-size:1.65rem;line-height:1.2;font-weight:650;letter-spacing:-.025em;margin:0 0 .6rem}
.exo-document .a2ui-text h2{font-size:1.2rem;line-height:1.3;font-weight:650;letter-spacing:-.01em;margin:1rem 0 .3rem}
.exo-document .a2ui-text h3,.exo-document .a2ui-text h4{font-size:1rem;line-height:1.4;font-weight:650;margin:.6rem 0 .2rem}
.exo-document .a2ui-text p{margin:.2rem 0 .5rem}
.exo-document .a2ui-text strong{font-weight:650}
.exo-document .a2ui-text ul,.exo-document .a2ui-text ol{padding-inline-start:1.5em;margin:.2rem 0 .6rem}
.exo-document .a2ui-text ul{list-style:disc}.exo-document .a2ui-text ol{list-style:decimal}
.exo-document .a2ui-text li{padding-inline-start:.2em;margin:.2rem 0}
.exo-document .a2ui-text li>ul,.exo-document .a2ui-text li>ol{margin:.15rem 0 .35rem}
.exo-document .a2ui-text blockquote{border-inline-start:2px solid var(--border,#dadce0);padding-inline-start:1rem;margin:.5rem 0}
.exo-document .a2ui-text pre{overflow-x:auto;max-width:100%}
.exo-document .a2ui-column>section,.exo-document .a2ui-list>section{gap:.65rem}
.exo-document .a2ui-row>section{gap:1.25rem;flex-wrap:wrap}.exo-document .a2ui-row>section>*{flex:1 1 18rem;min-width:0}
.exo-document .a2ui-card>section{height:auto;border:1px solid var(--border,#dadce0);border-radius:6px;padding:1.1rem;box-shadow:none;background:transparent;box-sizing:border-box}
.exo-document .a2ui-textfield{width:100%}.exo-document .a2ui-textfield>section{width:100%}
.exo-document .a2ui-textfield label{font-size:.85rem;font-weight:550}
.exo-document .a2ui-textfield textarea{box-sizing:border-box;min-height:5rem;padding:.65rem;border:1px solid var(--border,#dadce0);border-radius:4px;background:var(--background,#fff);color:inherit;font:inherit;resize:vertical}
.exo-document :is(button,textarea,input):focus-visible{outline:2px solid var(--ring,#1a73e8);outline-offset:3px}
`;
