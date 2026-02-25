import { useEffect, useRef } from "react";

const cursorCSS = `
#cur-cross {
  position: fixed;
  pointer-events: none;
  z-index: 999999;
  transform: translate(-50%, -50%);
}

#cur-cross .c-tl, #cur-cross .c-tr,
#cur-cross .c-bl, #cur-cross .c-br {
  position: absolute;
  width: 10px; height: 10px;
  transition: all 0.22s cubic-bezier(0.23,1,0.32,1);
}
#cur-cross .c-tl { top: 0; left: 0; border-top: 1.5px solid #22D3EE; border-left: 1.5px solid #22D3EE; }
#cur-cross .c-tr { top: 0; right: 0; border-top: 1.5px solid #22D3EE; border-right: 1.5px solid #22D3EE; }
#cur-cross .c-bl { bottom: 0; left: 0; border-bottom: 1.5px solid #22D3EE; border-left: 1.5px solid #22D3EE; }
#cur-cross .c-br { bottom: 0; right: 0; border-bottom: 1.5px solid #22D3EE; border-right: 1.5px solid #22D3EE; }

/* Short crosshair dashes */
#cur-cross .cx-h {
  position: absolute; top: 50%; left: 50%;
  width: 10px; height: 1px;
  background: rgba(34,211,238,0.85);
  box-shadow: 0 0 4px rgba(34,211,238,0.7);
  transform: translate(-50%, -50%);
}
#cur-cross .cx-v {
  position: absolute; top: 50%; left: 50%;
  width: 1px; height: 10px;
  background: rgba(34,211,238,0.85);
  box-shadow: 0 0 4px rgba(34,211,238,0.7);
  transform: translate(-50%, -50%);
}
#cur-cross .cx-dot {
  position: absolute; top: 50%; left: 50%;
  width: 3px; height: 3px; border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 6px #22D3EE;
  transform: translate(-50%, -50%);
  transition: transform 0.18s ease, background 0.18s;
}

/* Dim lines between center and brackets */
#cur-cross .gap-t { position: absolute; top: 10px; left: 50%; width: 1px; height: calc(50% - 17px); background: rgba(14,165,233,0.22); transform: translateX(-50%); }
#cur-cross .gap-b { position: absolute; bottom: 10px; left: 50%; width: 1px; height: calc(50% - 17px); background: rgba(14,165,233,0.22); transform: translateX(-50%); }
#cur-cross .gap-l { position: absolute; left: 10px; top: 50%; height: 1px; width: calc(50% - 17px); background: rgba(14,165,233,0.22); transform: translateY(-50%); }
#cur-cross .gap-r { position: absolute; right: 10px; top: 50%; height: 1px; width: calc(50% - 17px); background: rgba(14,165,233,0.22); transform: translateY(-50%); }

/* Hover */
#cur-cross.hov .c-tl { top: -5px; left: -5px; border-color: #fff; width: 14px; height: 14px; }
#cur-cross.hov .c-tr { top: -5px; right: -5px; border-color: #fff; width: 14px; height: 14px; }
#cur-cross.hov .c-bl { bottom: -5px; left: -5px; border-color: #fff; width: 14px; height: 14px; }
#cur-cross.hov .c-br { bottom: -5px; right: -5px; border-color: #fff; width: 14px; height: 14px; }
#cur-cross.hov .cx-dot { transform: translate(-50%, -50%) scale(2.2); background: rgba(34,211,238,0.45); box-shadow: 0 0 10px #22D3EE; }

/* Click */
#cur-cross.clicking .cx-dot {
  transform: translate(-50%, -50%) scale(0.4);
  background: #22D3EE; box-shadow: 0 0 14px #22D3EE;
}
#cur-cross.clicking .c-tl,
#cur-cross.clicking .c-tr,
#cur-cross.clicking .c-bl,
#cur-cross.clicking .c-br { width: 6px; height: 6px; }
`;

export function CrosshairCursor() {
  const ref = useRef(null);
  const pos = useRef({ x: -200, y: -200 });
  const cur = useRef({ x: -200, y: -200 });
  const raf = useRef(null);

  useEffect(() => {
    const mv = (e) => { pos.current = { x: e.clientX, y: e.clientY }; };
    const md = () => ref.current?.classList.add("clicking");
    const mu = () => ref.current?.classList.remove("clicking");
    const mo = (e) => { if (e.target.closest("button,a,[data-hover]")) ref.current?.classList.add("hov"); };
    const ml = (e) => { if (e.target.closest("button,a,[data-hover]")) ref.current?.classList.remove("hov"); };

    window.addEventListener("mousemove", mv);
    window.addEventListener("mousedown", md);
    window.addEventListener("mouseup", mu);
    document.addEventListener("mouseover", mo);
    document.addEventListener("mouseout", ml);

    const tick = () => {
      cur.current.x += (pos.current.x - cur.current.x) * 0.2;
      cur.current.y += (pos.current.y - cur.current.y) * 0.2;
      if (ref.current) {
        ref.current.style.left = cur.current.x + "px";
        ref.current.style.top  = cur.current.y + "px";
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", mv);
      window.removeEventListener("mousedown", md);
      window.removeEventListener("mouseup", mu);
      document.removeEventListener("mouseover", mo);
      document.removeEventListener("mouseout", ml);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <>
      <style>{cursorCSS}</style>
      <div id="cur-cross" ref={ref} style={{ width: 36, height: 36 }}>
        <div className="c-tl" />
        <div className="c-tr" />
        <div className="c-bl" />
        <div className="c-br" />
        <div className="cx-h" />
        <div className="cx-v" />
        <div className="cx-dot" />
        <div className="gap-t" />
        <div className="gap-b" />
        <div className="gap-l" />
        <div className="gap-r" />
      </div>
    </>
  );
}
