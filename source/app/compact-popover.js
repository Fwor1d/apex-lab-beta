export function bindPopovers(root){const abort=new AbortController(),opts={signal:abort.signal};
 const buttons=[...root.querySelectorAll('[data-popover]')];
 function close(button,restore=false){const panel=root.querySelector('#'+button.dataset.popover);panel.hidden=true;button.setAttribute('aria-expanded','false');if(restore)button.focus({preventScroll:true});}
 function closeAll(except){for(const b of buttons)if(b!==except)close(b);}
 for(const button of buttons){const panel=root.querySelector('#'+button.dataset.popover);button.addEventListener('click',()=>{const open=panel.hidden;closeAll(button);panel.hidden=!open;button.setAttribute('aria-expanded',String(open));if(open)panel.querySelector('input,button,select')?.focus({preventScroll:true});},opts);
 panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(button,true);}if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){const choices=[...panel.querySelectorAll('input,button,select')],i=choices.indexOf(document.activeElement);if(choices.length){e.preventDefault();choices[e.key==='Home'?0:e.key==='End'?choices.length-1:(i+(e.key==='ArrowDown'?1:-1)+choices.length)%choices.length].focus();}}},opts);
 panel.addEventListener('focusout',event=>{if(panel.contains(event.relatedTarget)||event.relatedTarget===button)return;requestAnimationFrame(()=>{if(!abort.signal.aborted&&!panel.contains(document.activeElement)&&document.activeElement!==button)close(button);});},opts);}
 document.addEventListener('pointerdown',e=>{for(const b of buttons){const p=root.querySelector('#'+b.dataset.popover);if(!p.contains(e.target)&&!b.contains(e.target))close(b);}},opts);
 root.addEventListener('keydown',e=>{if(e.key==='Escape'){for(const b of buttons){const p=root.querySelector('#'+b.dataset.popover);if(!p.hidden){e.stopPropagation();close(b,true);}}}},opts);
 return()=>abort.abort();
}
