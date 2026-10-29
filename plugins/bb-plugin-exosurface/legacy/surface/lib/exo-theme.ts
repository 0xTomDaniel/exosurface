// Exo canvas design tokens. Host neutrals (BB light/dark) + one accent and three
// meaning tones; colour encodes meaning only. Rounded display face for a calm,
// companionable voice; system text face for reading; tabular numerals for data.
// Orbit blue / trail teal nod to the Exomachina orbital reference (not adopted brand).
export const exoTheme=`
.exo-canvas{
 --exo-ink:var(--foreground,#1d2128);--exo-paper:var(--background,#fff);--exo-quiet:var(--muted-foreground,#646b78);--exo-line:var(--border,#dde1e7);
 --exo-accent:#3e5fd8;--exo-good:#1c8c80;--exo-caution:#b9770e;--exo-risk:#c2414f;
 --exo-accent-ink:color-mix(in oklab,var(--exo-accent) 72%,var(--exo-ink));
 --exo-wash:color-mix(in oklab,var(--exo-ink) 3.5%,var(--exo-paper));
 --exo-display:ui-rounded,"SF Pro Rounded","Nunito",system-ui,sans-serif;
 --exo-text:system-ui,-apple-system,"Segoe UI",sans-serif;
 --a2ui-color-primary:var(--exo-accent);--a2ui-color-primary-hover:color-mix(in oklab,var(--exo-accent) 86%,var(--exo-ink));--a2ui-color-on-primary:#fff;
 --a2ui-color-background:var(--exo-paper);--a2ui-color-on-background:var(--exo-ink);--a2ui-color-surface:var(--exo-paper);--a2ui-color-on-surface:var(--exo-ink);
 --a2ui-color-secondary:var(--exo-wash);--a2ui-color-secondary-hover:color-mix(in oklab,var(--exo-ink) 7%,var(--exo-paper));--a2ui-color-on-secondary:var(--exo-ink);
 --a2ui-color-border:var(--exo-line);--a2ui-color-input:var(--exo-paper);--a2ui-color-on-input:var(--exo-ink);
 --a2ui-font-family-title:var(--exo-display);--a2ui-font-size:15px;--a2ui-line-height-body:1.6;--a2ui-border-radius:8px;
 --a2ui-button-margin:0;--a2ui-button-padding:.5rem .95rem;--a2ui-button-border-radius:8px;--a2ui-button-font-weight:600;
 --a2ui-textfield-border-radius:8px;--a2ui-textfield-padding:.55rem .7rem;--a2ui-label-font-weight:550;--a2ui-label-font-size:.85rem;
 color:var(--exo-ink);font-family:var(--exo-text);font-size:15px;line-height:1.6;
}
/* Shell */
.exo-topline{display:flex;align-items:baseline;justify-content:space-between;gap:1rem;margin-bottom:.9rem}
.exo-topline h1{font-family:var(--exo-display);font-size:1rem;font-weight:650;letter-spacing:-.005em;margin:0}
.exo-topline p{margin:0;font-size:.8rem;color:var(--exo-quiet)}
.exo-status{font-size:.82rem;color:var(--exo-quiet);margin:0 0 1rem;display:flex;align-items:center;gap:.5rem}
.exo-status:empty{margin:0}
.exo-status[data-busy="true"]::before{content:"";width:.5rem;height:.5rem;border-radius:50%;background:var(--exo-accent);animation:exo-breathe 1.6s ease-in-out infinite}
.exo-shelf{display:flex;flex-wrap:wrap;gap:.35rem;align-items:center;margin:0 0 1.4rem}
.exo-more{font:inherit;font-size:.8rem;border:0;background:none;color:var(--exo-quiet);cursor:pointer;padding:.3rem .3rem}
.exo-more:hover{color:var(--exo-ink)}
.exo-shelf>span{font-size:.8rem;color:var(--exo-quiet);margin-right:.2rem}
.exo-pill{font:inherit;font-size:.8rem;line-height:1.2;padding:.28rem .65rem;border-radius:999px;border:1px solid var(--exo-line);background:transparent;color:var(--exo-ink);cursor:pointer;display:inline-flex;align-items:center;gap:.4rem;max-width:16rem}
.exo-pill:hover{background:var(--exo-wash)}
.exo-pill[aria-pressed="true"]{border-color:color-mix(in oklab,var(--exo-accent) 55%,var(--exo-line));color:var(--exo-accent-ink);background:color-mix(in oklab,var(--exo-accent) 8%,var(--exo-paper))}
.exo-pill .exo-dot{width:.42rem;height:.42rem;border-radius:50%;background:var(--exo-caution);flex:none}
.exo-pill span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.exo-follow{font:inherit;font-size:.8rem;border:0;background:none;color:var(--exo-accent-ink);cursor:pointer;padding:.3rem .2rem;text-decoration:underline;text-underline-offset:3px}
.exo-frame{width:100%;max-width:46rem;margin-inline:auto}
.exo-stage-grid{display:grid;gap:2.5rem;grid-template-columns:minmax(0,1fr);align-items:start}
/* Context sits beside the stage only when both get a readable width; otherwise it stacks below. */
@container exo-canvas (min-width:1180px){
 .exo-frame:has(.exo-stage-grid.has-beside){max-width:74rem}
 .exo-stage-grid.has-beside{grid-template-columns:minmax(0,46rem) minmax(20rem,25rem);justify-content:center;gap:3rem}
}
.exo-stage{min-width:0}
.exo-stage.exo-enter{animation:exo-enter .32s cubic-bezier(.2,.7,.2,1)}
.exo-beside{display:grid;gap:1.25rem;min-width:0;font-size:.94em}
.exo-beside .a2ui-text h1{font-size:1.3rem}.exo-beside .a2ui-text h2{font-size:1.1rem}
.exo-beside>section{padding:1rem 1.1rem;border-radius:12px;background:var(--exo-wash)}
.exo-hidden{display:none!important}
.exo-legacy-grid{display:grid;gap:2rem}
@keyframes exo-enter{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes exo-breathe{0%,100%{opacity:.35}50%{opacity:1}}
@media (prefers-reduced-motion:reduce){.exo-stage.exo-enter,.exo-status[data-busy="true"]::before,.exo-tl-now .exo-tl-mark::after{animation:none}}
/* Basic catalog polish */
.exo-generated .a2ui-text{overflow-wrap:break-word}
/* Rows wrap instead of squashing: each item keeps a readable minimum width. */
.exo-generated a2ui-basic-row{flex-wrap:wrap;gap:var(--a2ui-row-gap,.9rem)}
.exo-generated a2ui-basic-row>:not(a2ui-basic-button){flex:1 1 12rem;min-width:0}
.exo-generated .a2ui-text h1{font-family:var(--exo-display);font-size:1.75rem;line-height:1.15;font-weight:680;letter-spacing:-.02em;margin:0 0 .25rem;text-wrap:balance}
.exo-generated .a2ui-text h2{font-family:var(--exo-display);font-size:1.22rem;line-height:1.25;font-weight:650;letter-spacing:-.01em;margin:.9rem 0 .15rem;text-wrap:balance}
.exo-generated .a2ui-text h3,.exo-generated .a2ui-text h4{font-size:1rem;line-height:1.35;font-weight:650;margin:.5rem 0 .1rem}
.exo-generated .a2ui-text.caption,.exo-generated .a2ui-text em{color:var(--exo-quiet);font-size:.86rem;font-style:normal}
.exo-generated .a2ui-text p{margin:.15rem 0 .5rem;max-width:68ch}
.exo-generated .a2ui-text strong{font-weight:650}
.exo-generated .a2ui-text ul,.exo-generated .a2ui-text ol{padding-inline-start:1.3em;margin:.2rem 0 .6rem;max-width:66ch}
.exo-generated .a2ui-text ul{list-style:disc}.exo-generated .a2ui-text ol{list-style:decimal}
.exo-generated .a2ui-text li{margin:.2rem 0;padding-inline-start:.15em}
.exo-generated .a2ui-text li::marker{color:var(--exo-quiet)}
.exo-generated .a2ui-card{margin:0;border:1px solid var(--exo-line);border-radius:12px;padding:1.05rem 1.15rem;background:var(--exo-paper);box-shadow:none}
.exo-generated .a2ui-card .a2ui-card{border:0;padding:0;background:transparent}
.exo-generated .a2ui-button{transition:background-color .15s}
.exo-generated .a2ui-button.default{background:transparent;border:1px solid color-mix(in oklab,var(--exo-ink) 18%,var(--exo-paper))}
.exo-generated .a2ui-button.default:hover{background:var(--exo-wash)}
.exo-generated .a2ui-button.borderless{padding:.25rem 0;color:var(--exo-accent-ink);text-decoration:underline;text-underline-offset:3px;font-weight:550}
.exo-generated .a2ui-button.primary{box-shadow:0 1px 0 color-mix(in oklab,var(--exo-accent) 40%,transparent);margin-top:.35rem}
.exo-generated .a2ui-button .a2ui-text{font-size:.95rem}
.exo-generated hr{border:0;border-top:1px solid var(--exo-line);margin:.75rem 0}
.exo-generated :is(input:not([type=checkbox]):not([type=range]),textarea,select){box-sizing:border-box;width:100%;border:1px solid color-mix(in oklab,var(--exo-ink) 16%,var(--exo-paper));border-radius:8px;background:var(--exo-paper);color:inherit;font:inherit;padding:.55rem .7rem}
.exo-generated textarea{min-height:5rem;resize:vertical}
.exo-generated label{font-size:.85rem;font-weight:550;color:var(--exo-ink)}
.exo-generated .a2ui-chips-group{display:flex;flex-wrap:wrap;gap:.45rem;margin-top:.35rem}
.exo-generated .a2ui-chip{font:inherit;font-size:.9rem;padding:.42rem .85rem;border-radius:999px;border:1px solid color-mix(in oklab,var(--exo-ink) 18%,var(--exo-paper));background:var(--exo-paper);color:var(--exo-ink);cursor:pointer;transition:background-color .15s,border-color .15s}
.exo-generated .a2ui-chip:hover{background:var(--exo-wash)}
.exo-generated .a2ui-chip.selected{background:color-mix(in oklab,var(--exo-accent) 12%,var(--exo-paper));border-color:var(--exo-accent);color:var(--exo-accent-ink);font-weight:600}
.exo-generated .a2ui-chip.selected::before{content:"✓ ";font-weight:700}
.exo-generated input[type=checkbox]{accent-color:var(--exo-accent);width:1.05rem;height:1.05rem}
.exo-generated input[type=range]{accent-color:var(--exo-accent);width:100%}
.exo-generated .a2ui-tab-bar{display:flex;gap:1.25rem;border-bottom:1px solid var(--exo-line);margin-bottom:.9rem;overflow-x:auto}
.exo-generated .a2ui-tab-bar button{font:inherit;font-size:.9rem;font-weight:550;background:none;border:0;border-bottom:2px solid transparent;color:var(--exo-quiet);padding:.45rem 0;margin-bottom:-1px;cursor:pointer;border-radius:0}
.exo-generated .a2ui-tab-bar button.active,.exo-generated .a2ui-tab-bar button[aria-selected="true"]{color:var(--exo-ink);border-bottom-color:var(--exo-accent)}
.exo-generated :is(button,textarea,input,select,summary,a):focus-visible{outline:2px solid var(--exo-accent);outline-offset:2px}
/* Exo visual vocabulary */
.exo-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.exo-md p{margin:.1rem 0 .4rem}.exo-md p:last-child{margin-bottom:0}.exo-md ul,.exo-md ol{padding-inline-start:1.2em;margin:.2rem 0}
.exo-callout{border-left:3px solid var(--tone);background:color-mix(in oklab,var(--tone) 7%,var(--exo-paper));border-radius:0 10px 10px 0;padding:.8rem 1rem .85rem;margin:.2rem 0}
.exo-callout-decision{--tone:var(--exo-accent)}.exo-callout-caution{--tone:var(--exo-caution)}.exo-callout-good{--tone:var(--exo-good)}.exo-callout-note{--tone:color-mix(in oklab,var(--exo-ink) 45%,var(--exo-paper))}
.exo-callout-title{font-family:var(--exo-display);font-weight:650;font-size:1.02rem;margin:0 0 .2rem;color:color-mix(in oklab,var(--tone) 70%,var(--exo-ink))}
.exo-callout-body{font-size:.98rem}
.exo-tone-accent{--tone:var(--exo-accent)}.exo-tone-good{--tone:var(--exo-good)}.exo-tone-caution{--tone:var(--exo-caution)}.exo-tone-risk{--tone:var(--exo-risk)}.exo-tone-neutral{--tone:var(--exo-quiet)}
:where(.exo-metric){--tone:var(--exo-ink)}
.exo-metric{display:grid;gap:.15rem;min-width:8rem}
.exo-metric-label{font-size:.82rem;color:var(--exo-quiet)}
.exo-metric-value{font-family:var(--exo-display);font-size:1.9rem;font-weight:650;line-height:1.1;letter-spacing:-.02em;font-variant-numeric:tabular-nums;color:color-mix(in oklab,var(--tone) 75%,var(--exo-ink))}
.exo-metric-detail{font-size:.84rem;color:var(--exo-quiet)}
.exo-meter{display:block;height:6px;border-radius:99px;background:color-mix(in oklab,var(--exo-ink) 8%,var(--exo-paper));overflow:hidden;margin:.3rem 0 .1rem}
.exo-meter>span{display:block;height:100%;border-radius:99px;background:color-mix(in oklab,var(--tone) 80%,var(--exo-accent))}
.exo-metric:not([class*=exo-tone]) .exo-meter>span{background:var(--exo-accent)}
.exo-timeline{list-style:none;margin:.3rem 0;padding:0;display:grid}
.exo-timeline li{display:grid;grid-template-columns:5.2rem 1.4rem minmax(0,1fr);align-items:start;position:relative;padding-bottom:.95rem}
.exo-timeline li:last-child{padding-bottom:0}
.exo-timeline li:not(:last-child)::before{content:"";position:absolute;left:calc(5.2rem + .7rem - 1px);top:1.05rem;bottom:-.1rem;width:2px;background:var(--exo-line)}
.exo-timeline li.exo-tl-done:not(:last-child)::before{background:color-mix(in oklab,var(--exo-good) 45%,var(--exo-line))}
.exo-tl-when{font-size:.82rem;color:var(--exo-quiet);font-variant-numeric:tabular-nums;padding-top:.12rem;text-align:right;padding-right:.6rem}
.exo-tl-mark{width:.8rem;height:.8rem;border-radius:50%;margin:.32rem auto 0;border:2px solid var(--exo-line);background:var(--exo-paper);box-sizing:border-box;position:relative;z-index:1}
.exo-tl-done .exo-tl-mark{background:var(--exo-good);border-color:var(--exo-good)}
.exo-tl-next .exo-tl-mark{border-color:var(--exo-accent)}
.exo-tl-blocked .exo-tl-mark{border-color:var(--exo-risk);background:color-mix(in oklab,var(--exo-risk) 18%,var(--exo-paper))}
.exo-tl-now .exo-tl-mark{width:1rem;height:1rem;margin-top:.22rem;background:var(--exo-accent);border-color:var(--exo-accent);box-shadow:0 0 0 4px color-mix(in oklab,var(--exo-accent) 18%,transparent)}
.exo-tl-now .exo-tl-mark::after{content:"";position:absolute;inset:-6px;border-radius:50%;border:1.5px solid color-mix(in oklab,var(--exo-accent) 45%,transparent);animation:exo-orbit 2.4s ease-out 1}
@keyframes exo-orbit{from{transform:scale(.6);opacity:1}to{transform:scale(1.5);opacity:0}}
.exo-tl-body{display:grid;gap:.08rem;min-width:0}
.exo-tl-label{font-weight:560;display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem}
.exo-tl-done .exo-tl-label{color:var(--exo-quiet);font-weight:500}
.exo-tl-now .exo-tl-label{font-weight:650}
.exo-tl-state{font-size:.72rem;font-weight:600;padding:.05rem .45rem;border-radius:99px;background:var(--exo-wash);color:var(--exo-quiet)}
.exo-tl-now .exo-tl-state{background:color-mix(in oklab,var(--exo-accent) 12%,var(--exo-paper));color:var(--exo-accent-ink)}
.exo-tl-blocked .exo-tl-state{background:color-mix(in oklab,var(--exo-risk) 12%,var(--exo-paper));color:color-mix(in oklab,var(--exo-risk) 75%,var(--exo-ink))}
.exo-tl-detail{font-size:.88rem;color:var(--exo-quiet)}
.exo-table-wrap{overflow-x:auto;margin:.3rem 0}
.exo-table{border-collapse:collapse;width:100%;font-size:.92rem;font-variant-numeric:tabular-nums}
.exo-table caption{text-align:left;font-size:.84rem;color:var(--exo-quiet);padding-bottom:.4rem}
.exo-table :is(th,td){text-align:left;vertical-align:top;padding:.55rem .75rem;border-bottom:1px solid var(--exo-line)}
.exo-table thead th{font-weight:600;font-size:.84rem;color:var(--exo-quiet);border-bottom-color:color-mix(in oklab,var(--exo-ink) 22%,var(--exo-paper))}
.exo-table tbody th{font-weight:600;min-width:5rem}
.exo-table td{min-width:8.5rem}
.exo-table .exo-hl{background:color-mix(in oklab,var(--exo-accent) 7%,var(--exo-paper))}
.exo-table thead .exo-hl{color:var(--exo-accent-ink)}
.exo-table tr[class*=exo-tone] th:first-child{box-shadow:inset 3px 0 0 var(--tone)}
.exo-chart{margin:.4rem 0}
.exo-chart figcaption{font-size:.84rem;color:var(--exo-quiet);margin-bottom:.5rem}
.exo-bars{display:grid;grid-template-columns:minmax(5rem,9rem) minmax(0,1fr) auto;gap:.5rem .75rem;align-items:center}
.exo-bars>figcaption{grid-column:1/-1;margin-bottom:.1rem}
:where(.exo-bar){--tone:var(--exo-accent)}
.exo-bar{display:contents;font-size:.9rem}
.exo-bar>*{font-size:.9rem}
.exo-bar-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.exo-bar-track{height:.7rem;border-radius:99px;background:color-mix(in oklab,var(--exo-ink) 6%,var(--exo-paper))}
.exo-bar-track>span{display:block;height:100%;border-radius:99px;background:var(--tone);min-width:2px}
.exo-bar-value{font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}
.exo-bar-note{font-weight:400;color:var(--exo-quiet);margin-left:.4rem;font-size:.84rem}
.exo-line svg{width:100%;height:auto;overflow:visible}
.exo-axis{stroke:var(--exo-line)}
.exo-line-path{fill:none;stroke:var(--exo-accent);stroke-width:2.25;stroke-linejoin:round;stroke-linecap:round}
.exo-line circle{fill:var(--exo-paper);stroke:var(--exo-accent);stroke-width:2}
.exo-line g[class*=exo-tone] circle{stroke:var(--tone);fill:var(--tone)}
.exo-line-value{font-size:12px;font-weight:600;fill:var(--exo-ink);font-variant-numeric:tabular-nums}
.exo-line-label{font-size:11.5px;fill:var(--exo-quiet)}
.exo-flow{margin:.5rem 0;overflow-x:auto}
.exo-flow svg{width:100%;height:auto;overflow:visible;display:block}
.exo-edge{fill:none;stroke:color-mix(in oklab,var(--exo-ink) 28%,var(--exo-paper));stroke-width:1.5}
.exo-edge-back{stroke-dasharray:4 4}
.exo-arrowhead{fill:color-mix(in oklab,var(--exo-ink) 35%,var(--exo-paper))}
.exo-edge-label{font-size:11px;fill:var(--exo-quiet);paint-order:stroke;stroke:var(--exo-paper);stroke-width:4px}
:where(.exo-node){--tone:color-mix(in oklab,var(--exo-ink) 22%,var(--exo-paper))}
.exo-node{box-sizing:border-box;height:100%;border:1.5px solid var(--tone);border-radius:10px;background:var(--exo-paper);padding:.45rem .65rem;display:flex;flex-direction:column;justify-content:center;gap:.05rem;overflow:hidden;font-family:var(--exo-text);color:var(--exo-ink)}
.exo-node.exo-tone-accent{background:color-mix(in oklab,var(--exo-accent) 9%,var(--exo-paper))}
.exo-node-label{font-size:13px;font-weight:620;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.exo-node-detail{font-size:11.5px;line-height:1.3;color:var(--exo-quiet);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.exo-disclosure{border-top:1px solid var(--exo-line);border-bottom:1px solid var(--exo-line);margin:.2rem 0}
.exo-disclosure+.exo-disclosure,a2ui-react-host+a2ui-react-host>.exo-disclosure{border-top:0}
.exo-disclosure summary{cursor:pointer;list-style:none;padding:.65rem 0;display:flex;flex-wrap:wrap;align-items:baseline;gap:.3rem .75rem}
.exo-disclosure summary::-webkit-details-marker{display:none}
.exo-disclosure summary::before{content:"";width:.45rem;height:.45rem;border-right:1.5px solid var(--exo-quiet);border-bottom:1.5px solid var(--exo-quiet);transform:rotate(-45deg);transition:transform .15s;align-self:center;margin-right:.15rem}
.exo-disclosure[open] summary::before{transform:rotate(45deg)}
.exo-disclosure-title{font-weight:600}
.exo-disclosure-summary{font-size:.86rem;color:var(--exo-quiet)}
.exo-disclosure-body{padding:0 0 .9rem 1.05rem}
`;
